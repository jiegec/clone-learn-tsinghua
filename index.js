const thulib = require('thulib');
const request = require('request');
const fs = require('fs');
const readChunk = require('read-chunk');
const fileType = require('file-type');
const process = require('process');
const _ = require('lodash');

const user = {
    username: process.argv[2],
    getPassword: () => process.argv[3]
}

const rootDir = '/Volumes/Data/learn.tsinghua'

const req = request.defaults({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3251.0 Mobile Safari/537.36'
    }
})

let current = 0;
let all = 0;

function callback(course, documents, cookies) {
    documents = _.uniqBy(documents, 'title');
    all += documents.length;
    documents.forEach((document) => {
        /*
        if (blacklist.find(title => title == document.title)) {
            console.log('Blacklisted: ' + document.title);
            current++;
            return;
        }
        */

        if (Date.now() - new Date(document.updatingTime).getTime() > 1000 * 60 * 60 * 24 * 3) {
            console.log('Skipped: ' + document.title);
            current++;
            return;
        }

        let year = course.courseName.slice(course.courseName.lastIndexOf('(') + 1, course.courseName.lastIndexOf('(') + 10);
        let semester = course.courseName.slice(course.courseName.lastIndexOf('(') + 10, -1);
        let name = course.courseName.slice(0, course.courseName.lastIndexOf('('));

        let fileName = `${rootDir}/${year}/${semester}/${name}/${document.title}`;
        try {
            fs.mkdirSync(`${rootDir}/${year}`);
        } catch (e) {}
        try {
            fs.mkdirSync(`${rootDir}/${year}/${semester}`);
        } catch (e) {}
        try {
            fs.mkdirSync(`${rootDir}/${year}/${semester}/${name}`);
        } catch (e) {}

        let fileStream = fs.createWriteStream(fileName);
        let stream = req({
            method: 'GET',
            uri: document.url,
            jar: cookies
        }).pipe(fileStream);
        fileStream.on('finish', () => {
            const buffer = readChunk.sync(fileName, 0, 4100);
            let result = fileType(buffer);
            let ext = "txt";
            if (result !== null) {
                if (result.ext === 'msi') {
                    // BUG in file-type package
                    result.ext = 'ppt';
                }
                ext = result.ext;
            }
            fs.renameSync(fileName, fileName + '.' + ext);
            current++;
            console.log(current + ' / ' + all + ': ' + course.courseName + '/' + document.title + ' Done');
        });
    });
}

// const blacklist = fs.readFileSync('blacklist').toString().split('\n')
const learn_helper = new thulib.LearnHelperUtil(user);
const cic_learn_helper = new thulib.CicLearnHelperUtil(user);
const learn2018_helper = new thulib.Learn2018HelperUtil(user);
(async () => {
    await learn_helper.login();
    await cic_learn_helper.login();
    await learn2018_helper.login();
    (await learn_helper.getCourseList()).forEach((course) => {
        try {
            if (course.site == 'learn2001') {
                learn_helper.getDocuments(course).then((documents) => {
                    callback(course, documents, learn_helper.cookies);
                });
                learn_helper.getAssignments(course).then((assignments) => {
                    documents = assignments.filter((assignment) => assignment.fileURL).map((assignment) => {
                        let title = assignment.filename;
                        if (title.indexOf('.') !== -1) {
                            title = title.split('.').slice(0, -1).join('.');
                        }
                        return {
                            title,
                            url: assignment.fileURL,
                            updatingTime: assignment.startDate
                        }
                    });
                    callback(course, documents, learn_helper.cookies);
                });
            } else if (course.site == 'learn2015') {
                cic_learn_helper.getDocuments(course.courseID).then((documents) => {
                    callback(course, documents, cic_learn_helper.cookies);
                });
            } else if (course.site == 'learn2018') {
                // handled below
            }
        } catch (err) {
            console.log('got err: %s', err);
        }
    });
    (await learn2018_helper.getCourseList()).forEach((course) => {
        try {
            learn2018_helper.getDocuments(course).then((documents) => {
                callback(course, documents, learn2018_helper.cookies);
            });
        } catch (err) {
            console.log('got err: %s', err);
        }
    });
})();