// import { HttpMp4Pipeline } from '/msl-streams.min.js'
// 先打印模块所有导出内容，找到正确的Pipeline类名
import * as mslStreams from '/msl-streams.min.js';
console.log('msl-streams所有导出：', mslStreams); // 打开浏览器控制台查看输出


const play = (host) => {
  // Grab a reference to the video element
  const mediaElement = document.querySelector('video')

  // Setup a new pipeline
  const pipeline = new HttpMp4Pipeline({
    uri: `http://${host}/test/bbb.mp4`,
    mediaElement,
  })

  pipeline.start()
}

play(window.location.host)
