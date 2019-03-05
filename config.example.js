module.exports = {
    rootDir: '/path/to/yours',
    ignoreSize: 100, // 忽略大小大于ignoreSize(MB)的课程文件, -1表示不忽略
    ignoreCount: 70, // 忽略文件数量大于该数目的课程文件, -1表示不忽略
    ignoreDay: 14, // 忽略文件上传日期早于该数目的课程文件, -1表示不忽略
    semesters: { // 学期，1是秋季学期，2是春季学期，3是夏季学期
        '2018-2019-2': 'sub/dirname', // 会保存在rootDir/sub/dirname
    },
    username: 'xxx17', // 网络学堂用户名
    password: 'xxxxx', // 网络学堂密码
};
