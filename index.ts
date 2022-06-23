import * as fs from 'fs';
import * as _ from 'lodash';
import * as thuLearnLib from 'thu-learn-lib';
import { CourseInfo, File } from 'thu-learn-lib/lib/types';
import * as crossFetch from 'cross-fetch';
const realIsomorphicFetch = require('real-isomorphic-fetch');
import * as textVersionJs from 'textversionjs';
import * as htmlEntities from 'html-entities';
import * as cliProgress from 'cli-progress';
import { config } from './config';

const dirHomework = config.dirHomework;
const dirNotice = config.dirNotice;
const dirFile = config.dirFile;

let helper = new thuLearnLib.Learn2018Helper();

let current = 0;
let all = 0;

function bytesToSize(bytes: number) {
    if (bytes === 0) return '0B';
    var k = 1024, sizes = ['B', 'K', 'M', 'G'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i == 2)
        return String(Math.floor(bytes / Math.pow(k, i)).toFixed(0)) + '.0' + sizes[i];
    return String(Math.floor(bytes / Math.pow(k, i)).toFixed(0)) + sizes[i];
}

function isSameSize(document_size: string, stats_size: number) {
    if (document_size[document_size.length - 1] === 'B') {
        return (document_size.substring(0, document_size.length - 1) === stats_size.toString());
    } else {
        return (document_size === bytesToSize(stats_size));
    }
}

function createPath(path: string) {
    try {
        fs.mkdirSync(path);
    } catch (e) {
    }
}

function getAndEnsureSaveFileDir(semester: { dirname: string }, course: CourseInfo) {
    let dirname = semester.dirname;
    let name = cleanFileName(`${course.name}(${course.courseIndex})`);
    let path = `${config.rootDir}/${dirname}/${name}`;
    createPath(`${config.rootDir}`);
    createPath(`${config.rootDir}/${dirname}`);
    createPath(`${config.rootDir}/${dirname}/${name}`);
    createPath(`${config.rootDir}/${dirname}/${name}/${dirHomework}`);
    createPath(`${config.rootDir}/${dirname}/${name}/${dirNotice}`);
    createPath(`${config.rootDir}/${dirname}/${name}/${dirFile}`);
    return path;
}

function cleanFileName(fileName: string) {
    return fileName.replace(/[\/\\:\*\?\"\<\>\|]|[\x00-\x1F]/gi, '_').trim();
}

let tasks = [];

let multiBar = new cliProgress.MultiBar();

let bar = multiBar.create();

function progress(message: string) {
    multiBar.log(`${current}/${all}: ${message}\n`);
    bar.setTotal(all);
    bar.update(current);
}

async function callback(semester: { id: string, dirname: string }, course: CourseInfo, documents: File[]) {
    documents = _.uniqBy(documents, 'title');
    all += documents.length;
    if (config.ignoreCount !== -1 && documents.length > config.ignoreCount) {
        current += documents.length;
        progress(`Too many files skipped: ${course.name}`);
        return;
    }

    for (let document of documents) {
        if (config.ignoreDay !== -1 && Date.now() - new Date(document.uploadTime).getTime() >
            1000 * 60 * 60 * 24 * config.ignoreDay) {
            current++;
            progress(`Too old skipped: ${document.title}`);
            continue;
        }

        let title = cleanFileName(document.title);

        let dir = getAndEnsureSaveFileDir(semester, course);

        let fileName = `${dir}/${dirFile}/${title}.${document.fileType}`;

        try {
            const stats = fs.statSync(`${fileName}`);
            if (isSameSize(document.size, stats.size)) {
                current++;
                progress(`Already downloaded skipped: ${document.title}`);
                continue;
            } else {
                progress(`${document.title} Size mismatch: ` + document.size + ' vs ' + stats.size);
            }
        } catch (e) {

        }

        if (config.ignoreSize !== -1) {
            if (isNaN(Number(document.size)) && typeof document.size === 'string') {
                if ((document.size[document.size.length - 1] === 'G' &&
                    Number(document.size.substring(0, document.size.length - 1)) * 1024 > config.ignoreSize) ||
                    (document.size[document.size.length - 1] === 'M' &&
                        Number(document.size.substring(0, document.size.length - 1)) > config.ignoreSize) ||
                    (document.size[document.size.length - 1] === 'B' &&
                        Number(document.size.substring(0, document.size.length - 1)) > 1024 * 1024 * config.ignoreSize)) {
                    current++;
                    progress(`Too large skipped: ${document.title}`);
                    continue;
                }
            } else if (Number(document.size) > 1024 * 1024 * config.ignoreSize) {
                current++;
                progress(`Too large skipped: ${document.title}`);
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
                    try {
                        fs.utimesSync(fileName, document.uploadTime, document.uploadTime);
                    } catch (err) {
                        progress(`got err ${err} when downloading`);
                    }
                    current++;
                    progress(`${course.name}/${document.title}.${document.fileType} Downloaded`);
                    resolve(null);
                });
            }));
        })().catch(err => {
            progress(`got err ${err} when downloading`);
        }));
    }
}

let activeTasks = 0;
let taskLimit = 2;
let downloadBars = [];
for (let i = 0; i < taskLimit; i++) {
    downloadBars.push(multiBar.create());
}

function waitInner(resolve: (number) => void) {
    if (activeTasks < taskLimit) {
        let taskId = activeTasks;
        activeTasks++;
        resolve(taskId);
    } else {
        setTimeout(() => {
            waitInner(resolve);
        }, 100);
    }
}

function wait(): Promise<number> {
    return new Promise((resolve => {
        waitInner(resolve);
    }));
}

async function download(url: string, fileName: string, msg: string, time: Date) {
    // task limit
    let taskId = 0;
    if (activeTasks < taskLimit) {
        taskId = activeTasks;
        activeTasks++;
    } else {
        taskId = await wait();
    }

    let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
    let result = await fetch(url);

    let length = -1;
    let downloadBar = downloadBars[taskId];
    downloadBar.update(0);
    downloadBar.setTotal(0);

    if (result?.headers?.get('content-length')) {
        length = parseInt(result.headers.get('content-length'));
        let mib = length / 1024 / 1024;
        progress(`${msg} Downloading with size ${mib.toFixed(2)} MiB`);
        downloadBar.setTotal(length);
    }

    let fileStream = fs.createWriteStream(fileName);
    result.body.pipe(fileStream);

    // progress bar
    let recv = 0;
    result.body.on('data', (data) => {
        recv += data.length;
        downloadBar.update(recv);
    });

    await new Promise((resolve => {
        fileStream.on('finish', () => {
            current++;
            progress(`${msg} Downloaded`);
            fs.utimesSync(fileName, time, time);

            // finish
            downloadBar.update(length);
            activeTasks--;
            resolve(null);
        });
    }));
}

(async () => {
    await helper.login(config.username, config.password);
    const semesters = await helper.getSemesterIdList();
    all += semesters.length;
    for (let semesterId of semesters) {
        current++;
        progress(`Processing semester ${semesterId}`);

        if (!config.semesters.has(semesterId))
            continue;
        let semester = {
            id: semesterId,
            dirname: config.semesters.get(semesterId)!,
        };
        const courses = await helper.getCourseList(semester.id);
        all += courses.length;
        for (let course of courses) {
            current++;
            progress(`Processing course ${course.name} of semester ${semesterId}`);

            const files = await helper.getFileList(course.id, course.courseType);
            await callback(semester, course, files);
            const notifications = await helper.getNotificationList(course.id);
            let dir = getAndEnsureSaveFileDir(semester, course);

            // notification
            all += notifications.length;
            for (let notification of notifications) {
                let title = cleanFileName(notification.title);
                let file = `${dir}/${dirNotice}/${title}.txt`;
                fs.writeFileSync(file, textVersionJs(notification.content));
                fs.utimesSync(file, notification.publishTime, notification.publishTime);
                current++;
                progress(`${course.name}/${title}.txt Saved`);
                if (notification.attachment?.downloadUrl && notification.attachment?.name) {
                    let attachmentName = cleanFileName(notification.attachment.name);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(notification.publishTime).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        progress(`Too old skipped: ${title}-${attachmentName}`);
                        continue;
                    }
                    let fileName = `${dir}/${dirNotice}/${title}-${attachmentName}`;
                    tasks.push((async () => {
                        let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                        let result = await fetch(notification.attachment.downloadUrl);
                        let length = result.headers.get('Content-Length');
                        if (config.ignoreSize !== -1 && length > 1024 * 1024 * config.ignoreSize) {
                            progress(`Too large skipped: ${attachmentName}`);
                        } else {
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    progress(`${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded`);
                                    fs.utimesSync(fileName, notification.publishTime, notification.publishTime);
                                    resolve(null);
                                });
                            }));
                        }
                    })());
                }
            }

            // homework
            const homeworks = await helper.getHomeworkList(course.id);
            all += homeworks.length;
            for (let homework of homeworks) {
                let title = cleanFileName(htmlEntities.decode(homework.title));
                let file = `${dir}/${dirHomework}/${title}.txt`;
                let content = '';
                if (homework.description !== undefined) {
                    content += `说明： ${textVersionJs(homework.description).replace(/&videoVersion=[0-9]+/, '')}\n`;
                }
                if (homework.grade !== undefined) {
                    if (homework.gradeLevel !== undefined) {
                        content += `分数： ${homework.grade}(${homework.gradeLevel}) by ${homework.graderName}\n`;
                    } else {
                        content += `分数： ${homework.grade} by ${homework.graderName}\n`;
                    }
                }
                if (homework.gradeContent !== undefined) {
                    content += `评语： ${homework.gradeContent}\n`;
                }
                fs.writeFileSync(file, content);
                fs.utimesSync(file, homework.deadline, homework.deadline);

                current++;
                progress(`${course.name}/${title}.txt Saved`);

                // submission
                if (homework.submitted && homework.submittedAttachment?.downloadUrl && homework.submittedAttachment?.name) {
                    let attachmentName = cleanFileName(homework.submittedAttachment.name);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(homework.deadline).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        progress(`Too old skipped: ${title}-submitted-${attachmentName}`);
                    } else {
                        let fileName = `${dir}/${dirHomework}/${title}-submitted-${attachmentName}`;
                        tasks.push((async () => {
                            const time = homework.submitTime || new Date;
                            await download(homework.submittedAttachment.downloadUrl,
                                fileName,
                                `${course.name}/${title}-submitted-${attachmentName}`,
                                time
                            );
                        })());
                    }
                }

                // attachment
                if (homework.attachment?.downloadUrl && homework.attachment?.name) {
                    let attachmentName = cleanFileName(homework.attachment.name);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(homework.deadline).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        progress(`Too old skipped: ${title}-${attachmentName}`);
                    } else {
                        let fileName = `${dir}/${dirHomework}/${title}-${attachmentName}`;
                        tasks.push((async () => {
                            await download(homework.attachment.downloadUrl,
                                fileName,
                                `${course.name}/${title}-${attachmentName}`,
                                homework.deadline);
                        })());
                    }
                }

                // grade attachment
                if (homework.gradeAttachment?.downloadUrl && homework.gradeAttachment?.name) {
                    let attachmentName = cleanFileName(homework.gradeAttachment.name);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(homework.gradeTime).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        progress(`Too old skipped: ${title}-graded-${attachmentName}`);
                    } else {
                        let fileName = `${dir}/${dirHomework}/${title}-graded-${attachmentName}`;
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(homework.gradeAttachment.downloadUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    progress(`${course.name}/${title}-graded-${attachmentName} Downloaded`);
                                    fs.utimesSync(fileName, homework.gradeTime, homework.gradeTime);
                                    resolve(null);
                                });
                            }));
                        })());
                    }
                }
            }
        }
    }
    await Promise.all(tasks);
    multiBar.stop();
})().catch((err) => {
    console.log(err);
});
