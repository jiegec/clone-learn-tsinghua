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
    headers: {'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3251.0 Mobile Safari/537.36'}
})

function callback(course, documents, cookies) {
    documents = _.uniqBy(documents,'title');
    all += documents.length;
    documents.forEach((document) => {
        /*
        if (blacklist.find(title => title == document.title)) {
            console.log('Blacklisted: ' + document.title);
            current++;
            return;
        }
        */
    
        if (Date.now() - new Date(document.updatingTime).getTime() > 1000*60*60*24*7) {
            console.log('Skipped: ' + document.title);
            return;
        }
    
        let fileName = rootDir + '/' + course.courseName + '/' + document.title;
        try {
            fs.mkdirSync(rootDir + '/' + course.courseName);
        } catch (e) {
        }
    
        let fileStream = fs.createWriteStream(fileName);
        let stream = req({
            method: 'GET',
            uri: document.url,
            jar: cookies
        }).pipe(fileStream);
        fileStream.on('finish',() => {
            const buffer = readChunk.sync(fileName,0,4100);
            let result = fileType(buffer);
            let ext = "txt";
            if(result !== null) {
                if(result.ext === 'msi') {
                    // BUG in file-type package
                    result.ext = 'ppt';
                }
                ext = result.ext;
            }
            fs.renameSync(fileName,fileName+'.'+ext);
            current++;
            console.log(current + ' / ' + all + ': ' + course.courseName + '/' + document.title + ' Done');
        });
    });
}

// const blacklist = fs.readFileSync('blacklist').toString().split('\n')
const learn_helper = new thulib.LearnHelperUtil(user);
const cic_learn_helper = new thulib.CicLearnHelperUtil(process.argv[2], process.argv[3]);
let current = 0;
let all = 0;
(async () => {
    await learn_helper.login();
    await cic_learn_helper.login();
    let courses = await learn_helper.getCourseList();
    courses.forEach((course) => {
        learn_helper.getDocuments(course).then((documents) => {
            if (documents.length > 0) {
                callback(course, documents, learn_helper.cookies);
            } else  {
                cic_learn_helper.getDocuments(course.courseID).then((documents) => {
                    callback(course, documents, cic_learn_helper.cookies);
                });
            }
        });
    });
})();


