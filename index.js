const thulib = require('thulib');
const request = require('request');
const fs = require('fs');
const readChunk = require('read-chunk');
const fileType = require('file-type');
const process = require('process');

const user = {
    username: process.argv[2],
    getPassword: () => process.argv[3]
};

const rootDir = '/Volumes/Data/learn.tsinghua'

const learn_helper = new thulib.LearnHelperUtil(user);
learn_helper.login().then(() => {
    learn_helper.getCourseList().then((courses) => {
        courses.forEach((course) => {
            console.log(course.courseName);
            learn_helper.getDocuments(course).then((documents) => {
                documents.forEach((document) => {
                    if(document.title == 'Dev-C++' || document.title == 'Dev-C++(64bit)')
                        return;

                    let fileName = rootDir + '/' + course.courseName + '/' + document.title;
                    fs.mkdir(rootDir + '/' + course.courseName, err => {})
                    let stream = request({
                        method: 'GET',
                        uri: document.url,
                        jar: learn_helper.cookies
                    }).pipe(fs.createWriteStream(fileName));

                    stream.on('finish',() => {
                        console.log(course.courseName + '/' + document.title + ' Done');
                        const buffer = readChunk.sync(fileName,0,4100);
                        let result = fileType(buffer);
                        let ext = "txt";
                        if(result != null) {
                            if(result.ext == 'msi') // BUG in file-type package
                                result.ext = 'ppt';
                            ext = result.ext;
                        }
                        fs.renameSync(fileName,fileName+'.'+ext);
                    });
                });
            });
        });
    });
});
