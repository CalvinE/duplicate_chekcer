/* jshint esversion: 9*/

const crypto = require("crypto");

const fs = require("fs");

const path = require("path");

const pathIndex = process.argv.indexOf("--path");

const algorithmIndex = process.argv.indexOf("--algorithm");

const isDryRun = process.argv.indexOf("--dryrun") >= 0;

const targetPath = pathIndex > -1 ? process.argv[pathIndex + 1] : ".";

const algorithm = algorithmIndex > -1 ? process.argv[algorithmIndex + 1] : "sha1";

const fileMap = new Map();

function padNumber(n) {
    if (n < 10) {
        return `0${n}`;
    } else {
        return `${n}`;
    }
}

function getDateString(date) {
    const now = date || new Date();
    const year = now.getFullYear();
    const month = padNumber(now.getMonth());
    const dayOfMonth = padNumber(now.getDate());
    const hours = padNumber(now.getHours());
    const minutes = padNumber(now.getMinutes());
    const seconds = padNumber(now.getSeconds());

    return `${year}${month}${dayOfMonth}_${hours}${minutes}${seconds}`;
}

function calculateFileHash(file) {
    return new Promise((resolve, reject) => {
        try {
        const shasum = crypto.createHash(algorithm);
        const stream = fs.createReadStream(file.fullPath, {
    
        });

        stream.on("data", (data) => {
            shasum.update(data);
        });

        stream.on("end", () => {
            const hash = shasum.digest("hex");
            resolve({
                ...file,
                hash
            });
        });
    } catch(ex) {
        console.log("error reading file: ", filePath);
        resolve({
            ...file,
            hash: null
        });
    }
    });
}

function getContents(currentPath) {
    const contents = [];
    const currentPathListings = fs.readdirSync(currentPath).sort();
    currentPathListings.forEach((name) => {
        const fullPath = path.resolve(currentPath, name);
        const itemInfo = fs.lstatSync(fullPath);
        const size = itemInfo.size;
        const isDirectory = itemInfo.isDirectory();
        const isFile = itemInfo.isFile();
        contents.push({
            fileName: isFile ? name : undefined,
            fullPath,
            isDirectory,
            isFile,
            name,
            size,
        });
    });
    return contents;
}

async function analyzePath(currentPath) {
    const contents = getContents(currentPath);
    const directories = contents.filter((i) => i.isDirectory === true);
    const files = contents.filter((i) => i.isFile === true);
    console.log(`path examined: ${currentPath}`, directories.length, files.length);
    // directories.forEach((dir) => analyzePath(dir.fullPath));
    const fileHashPromises = [];
    for (const file of files) {
        fileHashPromises.push(calculateFileHash(file));
    }
    const hashResults = await Promise.all(fileHashPromises);

    for (const result of hashResults) {        
        console.log(`hash calculated for: ${result.fullPath}`, result.hash, result.size);
        if (result.hash != null) {            
            if (fileMap.has(result.hash)) {
                const currentFiles = fileMap.get(result.hash);
                currentFiles.push(result);
                fileMap.set(result.hash, [...currentFiles]);
            } else {
                fileMap.set(result.hash, [result]);
            }
        } else {
            console.log(`there was an error calculating hash for ${result.filePath}`);
        }
    }

    for (const dir of directories) {
        await analyzePath(dir.fullPath);
    }
}

async function run() {
    if (isDryRun) {
        console.log("dryrun flag present. no files will be deleted.");
    } else {
        console.log("WARNING! This is not a dry run, duplicate files will be deleted.");
    }
    const resolvedTargetPath = path.resolve(targetPath);
    await analyzePath(resolvedTargetPath);
}

function handleDuplicateCheckResults() {
    const keys = fileMap.keys();
    let cumulativeDuplicates = 0;
    let totalFiles = 0;
    let deletedFiles = [];
    let potentialDeletedFiles = [];
    let totalBytesSaved = 0;
    const start = new Date();
    for (const key of keys) {
        const contents = fileMap.get(key);
        if (contents.length > 1) {
            console.log(`${contents.length} instances of ${contents[0].fileName} found`);
            cumulativeDuplicates += contents.length - 1;
                for (let i = 1; i < contents.length; i++) {
                    totalBytesSaved += contents[i].size;
                    if (isDryRun) {
                        console.log(`dryrun flag enabled, skipping delete of ${contents[i].fullPath}`);
                        potentialDeletedFiles.push(contents[i].fullPath);
                    } else {
                        console.log(`deleting ${contents[i].fullPath}`);                            
                        fs.unlinkSync(contents[i].fullPath);
                        console.log(`${contents[i].fullPath} deleted`);
                        deletedFiles.push(contents[i].fullPath);
                    }
                }
        }
        totalFiles += contents.length;
    }
    const end = new Date();
    console.log(`there are ${cumulativeDuplicates} duplicate files out of ${totalFiles}`);
    // if (deletedFiles.length > 0) {
    //     console.log(`${deletedfiles.length} files deleted.`);
        const logData = {
            deletedFiles,
            deletedFilesCount: deletedFiles.length,
            duration: end.getTime() - start.getTime(),
            endTime: end.toISOString(),
            isDryRun,
            potentialDeletedFiles,
            potentialDeletedFilesCount: potentialDeletedFiles.length,
            startTime: start.toISOString(),
            targetPath,
            totalBytesSaved,
            totalFilesCount: totalFiles,
        };
        const duplicateCheckerLog = JSON.stringify(logData, null, 1);
        const fileName = isDryRun ? `./dryrun_${getDateString(start)}_duplicate_checker.log` : `./${getDateString(start)}_duplicate_checker.log`;
        fs.writeFileSync(fileName, duplicateCheckerLog, {
            encoding: "utf8"
        });
    // }
}

console.time("processing");

if (fs.existsSync(targetPath)) {
    run().then(handleDuplicateCheckResults).catch((ex) => {
        console.log("we encountered an error!", ex);
    }).finally(() => {
        console.timeEnd("processing");
        console.log("we are done!");
    });
} else {
    throw new Error(`path provided does not exist... ${targetPath}`);
}