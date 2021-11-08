import * as fs from 'fs';
import * as _ from 'lodash';
import * as thuLearnLib from 'thu-learn-lib';
import { CourseInfo, File } from 'thu-learn-lib/lib/types';
import * as crossFetch from 'cross-fetch';
const realIsomorphicFetch = require('real-isomorphic-fetch');
import * as textVersionJs from 'textversionjs';
import * as htmlEntities from 'html-entities';
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

async function callback(semester: { id: string, dirname: string }, course: CourseInfo, documents: File[]) {
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
            if (isNaN(parseFloat(document.size)) && typeof document.size === 'string') {
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
            } else if (parseFloat(document.size) > 1024 * 1024 * config.ignoreSize) {
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
                    try {
                        fs.utimesSync(fileName, document.uploadTime, document.uploadTime);
                    } catch (err) {
                        console.log('got err %o when downloading', err);
                    }
                    current++;
                    console.log(`${current}/${all}: ${course.name}/${document.title}.${document.fileType} Downloaded`);
                    resolve(null);
                });
            }));
        })().catch(err => {
            console.log('got err %o when downloading', err);
        }));
    }
}

(async () => {
    await helper.login(config.username, config.password);
    const semesters = await helper.getSemesterIdList();
    for (let semesterId of semesters) {
        if (!config.semesters.has(semesterId))
            continue;
        let semester = {
            id: semesterId,
            dirname: config.semesters.get(semesterId)!,
        };
        const courses = await helper.getCourseList(semester.id);
        for (let course of courses) {
            const files = await helper.getFileList(course.id, course.courseType);
            await callback(semester, course, files);
            const notifications = await helper.getNotificationList(course.id);
            all += notifications.length;
            let dir = getAndEnsureSaveFileDir(semester, course);

            // notification
            for (let notification of notifications) {
                let title = cleanFileName(notification.title);
                let file = `${dir}/${dirNotice}/${title}.txt`;
                fs.writeFileSync(file, textVersionJs(notification.content));
                fs.utimesSync(file, notification.publishTime, notification.publishTime);
                current++;
                console.log(`${current}/${all}: ${course.name}/${title}.txt Saved`);
                if (notification.attachment?.downloadUrl && notification.attachment?.name) {
                    let attachmentName = cleanFileName(notification.attachment.name);
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
                        let result = await fetch(notification.attachment.downloadUrl);
                        let length = result.headers.get('Content-Length');
                        if (config.ignoreSize !== -1 && length > 1024 * 1024 * config.ignoreSize) {
                            console.log(`${current}/${all}: Too large skipped: ${attachmentName}`);
                        } else {
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded`);
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
                console.log(`${current}/${all}: ${course.name}/${title}.txt Saved`);

                // submission
                if (homework.submitted && homework.submittedAttachment?.downloadUrl && homework.submittedAttachment?.name) {
                    let attachmentName = cleanFileName(homework.submittedAttachment.name);
                    all++;
                    if (config.ignoreDay !== -1 && Date.now() - new Date(homework.deadline).getTime() >
                        1000 * 60 * 60 * 24 * config.ignoreDay) {
                        current++;
                        console.log(`${current}/${all}: Too old skipped: ${title}-submitted-${attachmentName}`);
                    } else {
                        let fileName = `${dir}/${dirHomework}/${title}-submitted-${attachmentName}`;
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(homework.submittedAttachment.downloadUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${current}/${all}: ${course.name}/${title}-submitted-${attachmentName} Downloaded`);
                                    const time = homework.submitTime || new Date;
                                    fs.utimesSync(fileName, time, time);
                                    resolve(null);
                                });
                            }));
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
                        console.log(`${current}/${all}: Too old skipped: ${title}-${attachmentName}`);
                    } else {
                        let fileName = `${dir}/${dirHomework}/${title}-${attachmentName}`;
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(homework.attachment.downloadUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded`);
                                    fs.utimesSync(fileName, homework.deadline, homework.deadline);
                                    resolve(null);
                                });
                            }));
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
                        console.log(`${current}/${all}: Too old skipped: ${title}-graded-${attachmentName}`);
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
                                    console.log(`${current}/${all}: ${course.name}/${title}-graded-${attachmentName} Downloaded`);
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
})().catch((err) => {
    console.log(err);
});
