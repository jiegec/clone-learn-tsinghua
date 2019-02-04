const fs = require('fs');
const process = require('process');
const _ = require('lodash');
const thuLearnLib = require('thu-learn-lib');
const crossFetch = require('cross-fetch');
const realIsomorphicFetch = require('real-isomorphic-fetch');
const textVersionJs = require('textversionjs');
const htmlEntities = require('html-entities').AllHtmlEntities;

const rootDir = '/Volumes/Data/jiegec/learn.tsinghua';

let helper = new thuLearnLib.Learn2018Helper();

let current = 0;
let all = 0;

function bytesToSize(bytes) {
    if (bytes === 0) return '0B';
    var k = 1024, sizes = ['B', 'K', 'M', 'G'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i == 1 && (bytes / Math.pow(k, 2)) >= 0.95) // case of '0.9?M'
        i = 2;
    var tmp = String((bytes / Math.pow(k, i)).toFixed(2)); // size
    if (i == 1 || tmp[tmp.length - 1] === '0') { // case of 'K' or remove the last 0
        return String((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
    } else {
        return String((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
    }
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

function getAndEnsureSaveFileDir(semester, course) {
    let year = `${semester.startYear}-${semester.endYear}`;
    let semesterType = semester.type;
    let name = `${course.name}(${course.courseIndex})`;
    try {
        fs.mkdirSync(`${rootDir}/${year}`);
    } catch (e) {
    }
    try {
        fs.mkdirSync(`${rootDir}/${year}/${semesterType}`);
    } catch (e) {
    }
    try {
        fs.mkdirSync(`${rootDir}/${year}/${semesterType}/${name}`);
    } catch (e) {
    }
    return `${rootDir}/${year}/${semesterType}/${name}`;
}

async function callback(semester, course, documents, cookies) {
    documents = _.uniqBy(documents, 'title');
    all += documents.length;
    if (documents.length > 70) {
        current += documents.length;
        console.log(`${current}/${all}: Too many files skipped: ${course.name}`);
        return;
    }

    for (let document of documents) {
        if (Date.now() - new Date(document.uploadTime).getTime() >
            1000 * 60 * 60 * 24 * 30) {
            current++;
            console.log(`${current}/${all}: Too old skipped: ${document.title}`);
            return;
        }

        let title = document.title.replace(/\//gi, '_').trim();

        let dir = getAndEnsureSaveFileDir(semester, course);

        let fileName = `${dir}/${title}.${document.fileType}`;

        try {
            const stats = fs.statSync(`${fileName}`);
            if (isSameSize(document.size, stats.size)) {
                current++;
                console.log(`${current}/${all}: Already downloaded skipped: ${document.title}`);
                return;
            } else {
                console.log('Mismatch: ' + document.size + ' vs ' + stats.size);
                return;
            }
        } catch (e) {

        }

        if (isNaN(document.size) && typeof document.size === 'string') {
            if (document.size[document.size.length - 1] === 'G' ||
                (document.size[document.size.length - 1] === 'M' &&
                    Number(document.size.substring(0, document.size.length - 1)) > 100) ||
                (document.size[document.size.length - 1] === 'B' &&
                    Number(document.size.substring(0, document.size.length - 1)) > 1024 * 1024 * 100)) {
                current++;
                console.log(`${current}/${all}: Too large skipped: ${document.title}`);
                return;
            }
        } else if (document.size > 1024 * 1024 * 100) {
            current++;
            console.log(`${current}/${all}: Too large skipped: ${document.title}`);
            return;
        }

        let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
        let result = await fetch(document.downloadUrl);
        let fileStream = fs.createWriteStream(fileName);
        result.body.pipe(fileStream);
        current++;
        console.log(`${current}/${all}: ${course.name}/${document.title}.${document.fileType} Downloading`);
    }
}

(async () => {
    await helper.login(process.argv[2], process.argv[3]);
    const semester = await helper.getCurrentSemester();
    const courses = await helper.getCourseList(semester.id);
    for (let course of courses) {
        const files = await helper.getFileList(course.id);
        await callback(semester, course, files, {});
        const notifications = await helper.getNotificationList(course.id);
        all += notifications.length;
        let dir = getAndEnsureSaveFileDir(semester, course);
        for (let notification of notifications) {
            let title = notification.title.replace(/\//gi, '_').trim();
            let file = `${dir}/${title}.txt`;
            fs.writeFileSync(file, textVersionJs(notification.content));
            current ++;
            console.log(`${current}/${all}: ${course.name}/${notification.title}.txt Saving`);
        }
        const homeworks = await helper.getHomeworkList(course.id);
        all += homeworks.length;
        for (let homework of homeworks) {
            let title = htmlEntities.decode(homework.title).trim();
            let file = `${dir}/${title}.txt`;
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
            current ++;
            console.log(`${current}/${all}: ${course.name}/${title}.txt Saving`);
            if (homework.submitted && homework.submittedAttachmentUrl && homework.submittedAttachmentName) {
                all ++;
                let fileName = `${dir}/${title}-${homework.submittedAttachmentName}`;
                let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                let result = await fetch(homework.submittedAttachmentUrl);
                let fileStream = fs.createWriteStream(fileName);
                result.body.pipe(fileStream);
                current++;
                console.log(`${current}/${all}: ${course.name}/${title}-${homework.submittedAttachmentName} Downloading`);
            }
        }
    }
})();
