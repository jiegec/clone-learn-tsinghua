const fs = require('fs');
const _ = require('lodash');
const thuLearnLib = require('thu-learn-lib');
const crossFetch = require('cross-fetch');
const realIsomorphicFetch = require('real-isomorphic-fetch');
const textVersionJs = require('textversionjs');
const htmlEntities = require('html-entities').AllHtmlEntities;
const config = require('./config');
const dirHomework = 'homework';
const dirNotice = 'notice';
const dirFile = 'file';

let helper = new thuLearnLib.Learn2018Helper();

let current = 0;
let all = 0;

function bytesToSize(bytes) {
    if (bytes === 0) return '0B';
    var k = 1024, sizes = ['B', 'K', 'M', 'G'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i == 2)
        return String(Math.floor(bytes / Math.pow(k, i)).toFixed(0)) + '.0' + sizes[i];
    return String(Math.floor(bytes / Math.pow(k, i)).toFixed(0)) + sizes[i];
}

function isSameSize(document_size, stats_size) {
    if (typeof document_size == 'string') {
        if (document_size[document_size.length - 1] === 'B') {
            return (document_size.substring(0, document_size.length - 1) == stats_size);
        } else {
            return (document_size == bytesToSize(stats_size));
        }
    } else {
        return (document_size == stats_size);
    }
}

function createPath(path) {
    try {
        fs.mkdirSync(path);
    } catch (e) {
    }
}

function getAndEnsureSaveFileDir(semester, course) {
    let dirname = semester.dirname;
    let name = `${course.name}(${course.courseIndex})`;
    let path = `${config.rootDir}/${dirname}/${name}`;
    createPath(`${config.rootDir}`);
    createPath(`${config.rootDir}/${dirname}`);
    createPath(`${config.rootDir}/${dirname}/${name}`);
    createPath(`${config.rootDir}/${dirname}/${name}/${dirHomework}`);
    createPath(`${config.rootDir}/${dirname}/${name}/${dirNotice}`);
    createPath(`${config.rootDir}/${dirname}/${name}/${dirFile}`);
    return path;
}

function cleanFileName(fileName) {
    return fileName.replace(/[\/\\:\*\?\"\<\>\|]/gi, '_').trim();
}

let tasks = [];

async function callback(semester, course, documents, cookies) {
    documents = _.uniqBy(documents, 'title');
    all += documents.length;
    if (config.ignoreCount !== -1 && documents.length > config.ignoreCount) {
        current += documents.length;
        console.log(`${current}/${all}: Too many files skipped: ${course.name}`);
        return;
    }

    for (let document of documents) {
        if (config.ignoreDay !== -1 && Date.now() - new Date(document.uploadTime).getTime() >
            1000 * 60 * 60 * 24 * config.ignoreDay) {
            current++;
            console.log(`${current}/${all}: Too old skipped: ${document.title}`);
            continue;
        }

        let title = cleanFileName(document.title);

        let dir = getAndEnsureSaveFileDir(semester, course);

        let fileName = `${dir}/${dirFile}/${title}.${document.fileType}`;

        try {
            const stats = fs.statSync(`${fileName}`);
            if (isSameSize(document.size, stats.size)) {
                current++;
                console.log(`${current}/${all}: Already downloaded skipped: ${document.title}`);
                continue;
            } else {
                console.log(`${document.title} Size mismatch: ` + document.size + ' vs ' + stats.size);
            }
        } catch (e) {

        }

        if (config.ignoreSize !== -1) {
            if (isNaN(document.size) && typeof document.size === 'string') {
                if ((document.size[document.size.length - 1] === 'G' &&
                    Number(document.size.substring(0, document.size.length - 1)) * 1024 > config.ignoreSize) ||
                    (document.size[document.size.length - 1] === 'M' &&
                        Number(document.size.substring(0, document.size.length - 1)) > config.ignoreSize) ||
                    (document.size[document.size.length - 1] === 'B' &&
                        Number(document.size.substring(0, document.size.length - 1)) > 1024 * 1024 * config.ignoreSize)) {
                    current++;
                    console.log(`${current}/${all}: Too large skipped: ${document.title}`);
                    continue;
                }
            } else if (document.size > 1024 * 1024 * config.ignoreSize) {
                current++;
                console.log(`${current}/${all}: Too large skipped: ${document.title}`);
                continue;
            }
        }

        tasks.push((async () => {
            // launch async download task
            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
            let result = await fetch(document.downloadUrl);
            let fileStream = fs.createWriteStream(fileName);
            result.body.pipe(fileStream);
            await new Promise((resolve => {
                fileStream.on('finish', () => {
                    fs.utimesSync(fileName, document.uploadTime, document.uploadTime);
                    current++;
                    console.log(`${current}/${all}: ${course.name}/${document.title}.${document.fileType} Downloaded`);
                    resolve();
                });
            }));
        })());
    }
}

(async () => {
    await helper.login(config.username, config.password);
    const semesters = await helper.getSemesterIdList();
    for (let semesterId of semesters) {
        if (!(semesterId in config.semesters))
            continue;
        let semester = {
            id: semesterId,
            dirname: config.semesters[semesterId],
        };
        const courses = await helper.getCourseList(semester.id);
        for (let course of courses) {
            const files = await helper.getFileList(course.id);
            await callback(semester, course, files, {});
            const notifications = await helper.getNotificationList(course.id);
            all += notifications.length;
            let dir = getAndEnsureSaveFileDir(semester, course);
            for (let notification of notifications) {
                let title = cleanFileName(notification.title);
                let file = `${dir}/${dirNotice}/${title}.txt`;
                fs.writeFileSync(file, textVersionJs(notification.content));
                fs.utimesSync(file, notification.publishTime, notification.publishTime);
                current++;
                console.log(`${current}/${all}: ${course.name}/${title}.txt Saved`);
                if (notification.attachmentUrl && notification.attachmentName) {
                    let attachmentName = cleanFileName(notification.attachmentName);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(notification.publishTime).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        console.log(`${current}/${all}: Too old skipped: ${title}-${attachmentName}`);
                        continue;
                    }
                    let fileName = `${dir}/${dirNotice}/${title}-${attachmentName}`;
                    tasks.push((async () => {
                        let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                        let result = await fetch(notification.attachmentUrl);
                        let fileStream = fs.createWriteStream(fileName);
                        result.body.pipe(fileStream);
                        await new Promise((resolve => {
                            fileStream.on('finish', () => {
                                current++;
                                console.log(`${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded`);
                                fs.utimesSync(fileName, notification.publishTime, notification.publishTime);
                                resolve();
                            });
                        }));
                    })());
                }
            }
            const homeworks = await helper.getHomeworkList(course.id);
            all += homeworks.length;
            for (let homework of homeworks) {
                let title = cleanFileName(htmlEntities.decode(homework.title));
                let file = `${dir}/${dirHomework}/${title}.txt`;
                let content = '';
                if (homework.description !== undefined) {
                    content += `说明： ${textVersionJs(homework.description)}\n`;
                }
                if (homework.grade !== undefined) {
                    content += `分数： ${homework.grade} by ${homework.graderName}\n`;
                }
                if (homework.gradeContent !== undefined) {
                    content += `评语： ${homework.gradeContent}\n`;
                }
                fs.writeFileSync(file, content);
                fs.utimesSync(file, homework.deadline, homework.deadline);
                current++;
                console.log(`${current}/${all}: ${course.name}/${title}.txt Saved`);
                if (homework.submitted && homework.submittedAttachmentUrl && homework.submittedAttachmentName) {
                    let attachmentName = cleanFileName(homework.submittedAttachmentName);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(homework.deadline).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        console.log(`${current}/${all}: Too old skipped: ${title}-${attachmentName}`);
                        continue;
                    }
                    let fileName = `${dir}/${dirHomework}/${title}-${attachmentName}`;
                    tasks.push((async () => {
                        let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                        let result = await fetch(homework.submittedAttachmentUrl);
                        let fileStream = fs.createWriteStream(fileName);
                        result.body.pipe(fileStream);
                        await new Promise((resolve => {
                            fileStream.on('finish', () => {
                                current++;
                                console.log(`${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded`);
                                fs.utimesSync(fileName, homework.submitTime, homework.submitTime);
                                resolve();
                            });
                        }));
                    })());
                }
                if (homework.attachmentUrl && homework.attachmentName) {
                    let attachmentName = cleanFileName(homework.attachmentName);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(homework.deadline).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        console.log(`${current}/${all}: Too old skipped: ${title}-${attachmentName}`);
                        continue;
                    }
                    let fileName = `${dir}/${dirHomework}/${title}-${attachmentName}`;
                    tasks.push((async () => {
                        let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                        let result = await fetch(homework.attachmentUrl);
                        let fileStream = fs.createWriteStream(fileName);
                        result.body.pipe(fileStream);
                        await new Promise((resolve => {
                            fileStream.on('finish', () => {
                                current++;
                                console.log(`${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded`);
                                fs.utimesSync(fileName, homework.deadline, homework.deadline);
                                resolve();
                            });
                        }));
                    })());
                }
            }
        }
    }
    await Promise.all(tasks);
})();
