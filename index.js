const request = require("request");
const path = require("path");
const _ = require("lodash");
const fs = require("fs");
const moment = require("moment");
const minimist = require("minimist");
const randomstring = require("randomstring");
const repeatstring = require("repeat-string");
const cp = require("child_process");
const pkg = require("./package.json");

const baseUri = pkg.config.base_url;
const localStorage = path.join(__dirname, ".local_storage");

function getContextFromLocalStorage() {
    try {
        const output = fs.readFileSync(localStorage);
        return JSON.parse(output);
    }
    catch (error) {
        return {
            productId: null,
            accessToken: null,
            repositories: {
            },
            branches: {
            },
            trees: {
            }
        };
    }
}
function setContextToLocalStorage(context) {
    try {
        const input = JSON.stringify(context);
        fs.writeFileSync(localStorage, input);
        return true;
    }
    catch (error) {
        return false;
    }
}
async function httpGet(uri, accessToken) {
    return new Promise((resolve, reject) => {
        request.get(
            uri,
            {
                headers: {
                    authorization: accessToken ? `Bearer ${accessToken}` : undefined
                }
            },
            (error, response) => {
                if (error) {
                    reject(error);
                }
                else {
                    try {
                        const body = typeof response.body === "object" ? response.body : JSON.parse(response.body);

                        if (body && body.code && body.message) {
                            reject(new Error(body.message));
                        }
                        else {
                            resolve(body);
                        }
                    }
                    catch (error) {
                        reject(error);
                    }
                }
            });
    });
}
async function httpPost(uri, body, accessToken) {
    return new Promise((resolve, reject) => {
        request.post(
            uri,
            {
                json: body,
                headers: {
                    authorization: accessToken ? `Bearer ${accessToken}` : undefined
                }
            },
            (error, response) => {
                if (error) {
                    reject(error);
                }
                else {
                    try {
                        const body = typeof response.body === "object" ? response.body : JSON.parse(response.body);

                        if (body && body.code && body.message) {
                            reject(new Error(body.message));
                        }
                        else {
                            resolve(body);
                        }
                    }
                    catch (error) {
                        reject(error);
                    }
                }
            });
    });
}
async function ping(accessToken) {
    const body = await httpGet(`${baseUri}/v1/auth/ping`, accessToken);
    return body && body.context;
}
async function getAccessToken() {
    const clientId = pkg.config.client_id;
    const clientSecret = pkg.config.client_secret;

    const body = await httpGet(`${baseUri}/v1/auth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`);
    return body && body.access_token;
}
async function getProductId(context) {
    if (context && context.productId) {
        return context.productId;
    }
    else {
        const productName = pkg.config.product_name;
        const products = await httpGet(`${baseUri}/v1/scm/products?name=${productName}`, context.accessToken);

        if (products && products.total && products.total > 0 && products.values) {
            const product = products.values[0];
            return product.id;
        }
        else {
            const product = await httpPost(`${baseUri}/v1/scm/products`,
                {
                    "name": productName,
                    "type": "svn",
                    "description": "Subversion"
                },
                context.accessToken
            );
            return product.id
        }
    }
}
async function getRepositoryId(context, repositoryName) {
    if (context && context.repositories && context.repositories[repositoryName]) {
        return context.repositories[repositoryName];
    }
    else {
        const repositories = await httpGet(`${baseUri}/v1/scm/products/${context.productId}/repositories?name=${repositoryName}`, context.accessToken);

        if (repositories && repositories.total && repositories.total > 0 && repositories.values) {
            const repository = repositories.values[0];
            return repository.id;
        }
        else {
            const repository = await httpPost(`${baseUri}/v1/scm/products/${context.productId}/repositories`,
                {
                    "name": repositoryName,
                    "full_name": repositoryName,
                    "is_fork": false,
                    "is_private": true,
                    "owner_name": "admin",
                    "created_at": moment.unix()
                },
                context.accessToken
            );
            return repository.id
        }
    }
}
async function getDefaultBranchId(context, repositoryName, branchName) {
    if (context && context.branches && context.branches[repositoryName]) {
        return context.branches[repositoryName];
    }
    else {
        const repositoryId = context.repositories[repositoryName];
        const branches = await httpGet(`${baseUri}/v1/scm/products/${context.productId}/repositories/${repositoryId}/branches?name=${branchName}`, context.accessToken);

        if (branches && branches.total && branches.total > 0 && branches.values) {
            const branch = branches.values[0];
            return branch.id;
        }
        else {
            const branch = await httpPost(`${baseUri}/v1/scm/products/${context.productId}/repositories/${repositoryId}/branches`,
                {
                    "name": branchName,
                    "sender_name": "admin",
                    "created_at": moment.unix(),
                    "is_default": true,
                },
                context.accessToken
            );
            return branch.id
        }
    }
}
function getIdentifierFromMessage(str) {
    const suspects = str.match(/#[^\s]*[A-Za-z0-9_]+-[0-9]+/g);
    if (suspects && suspects.length > 0) {
        return suspects.map(s => s.substr(1));
    } else {
        return [];
    }
}
function getChangedFiles(str) {
    const files = [];

    str.split("\n").forEach(file => {
        if (file.length > 0) {
            files.push(file.substr(1).trim());
        }
    });

    return files;
}
function fetchCommitFromLocal(context, repositoryName, cmdPath, rev) {
    const sha = rev + repeatstring(" ", 10 - rev.toString().length) + randomstring.generate({ length: 30, charset: "hex" });
    const message = cp.execSync(`svnlook log ${cmdPath} -r ${rev}`).toString().trim();
    const identifiers = getIdentifierFromMessage(message || "");
    const author = cp.execSync(`svnlook author ${cmdPath} -r ${rev}`).toString().trim();
    const createAt = new Date(cp.execSync(`svnlook date ${cmdPath} -r ${rev}`).toString().trim())
    const changesOutput = cp.execSync(`svnlook changed ${cmdPath} -r ${rev}`).toString().trim();
    const changes = getChangedFiles(changesOutput);

    return {
        "sha": sha,
        "message": message,
        "committer_name": author,
        "committed_at": moment(createAt).unix(),
        "tree_id": context.trees[repositoryName],
        "files_added": [],
        "files_removed": [],
        "files_modified": changes,
        "work_item_identifiers": identifiers
    }
}
async function getUserId(context, userName) {
    const users = await httpGet(`${baseUri}/v1/scm/products/${context.productId}/users?name=${userName}`, context.accessToken);

    if (users && users.total && users.total > 0 && users.values) {
        const user = users.values[0];
        return user.id;
    }
    else {
        const user = await httpPost(`${baseUri}/v1/scm/products/${context.productId}/users`,
            {
                "name": userName,
                "display_name": userName
            },
            context.accessToken
        );
        return user.id
    }
}
async function sendCommitToWorktile(context, repositoryName, localCommit) {
    const repositoryId = context.repositories[repositoryName];
    const branchId = context.branches[repositoryName];

    await httpPost(`${baseUri}/v1/scm/commits`,
        localCommit,
        context.accessToken
    );
    await httpPost(`${baseUri}/v1/scm/products/${context.productId}/repositories/${repositoryId}/refs`,
        {
            "meta_type": "branch",
            "meta_id": branchId,
            "sha": localCommit.sha
        },
        context.accessToken
    );

    return true;
}

async function doProcess(repositoryName, cmdPath, rev) {
    const context = getContextFromLocalStorage();

    try {
        await ping(context.accessToken);
    }
    catch (error) {
        context.accessToken = await getAccessToken();
    }

    context.productId = await getProductId(context);
    context.repositories[repositoryName] = await getRepositoryId(context, repositoryName);
    context.branches[repositoryName] = await getDefaultBranchId(context, repositoryName, "master");
    context.trees[repositoryName] = context.trees[repositoryName] || randomstring.generate({ length: 40, charset: "hex" })

    setContextToLocalStorage(context);

    commit = fetchCommitFromLocal(context, repositoryName, cmdPath, rev);
    const userId = await getUserId(context, commit.committer_name);
    await sendCommitToWorktile(context, repositoryName, commit);
}

(async () => {
    const argv = process.argv && minimist(process.argv.slice(2));

    if (argv && argv.r && argv.p) {
        const rev = argv.r;

        const cmdPaths = argv.p.split("/");

        if (cmdPaths[cmdPaths.length - 1] !== "hooks" || cmdPaths.length < 2) {
            throw new Error("Please set the path of hooks folder");
        }
        else {
            const repositoryName = cmdPaths[cmdPaths.length - 2];
            const cmdPath = cmdPaths.slice(0, cmdPaths.length - 1).join("/");

            try {
                await doProcess(repositoryName, cmdPath, rev);
            }
            catch (error) {
                // retry 1 times
                await doProcess(repositoryName, cmdPath, rev);
            }
        }
    }
    else {
        throw new Error("Missing parameters: -r(rev) and -p(the path of hooks folder)");
    }
})()
    .then(result => {
        console.log("Commit sent");
    })
    .catch(error => {
        console.error(error);
    });
