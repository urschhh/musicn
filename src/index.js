#!/usr/bin/env node

const commander = require("commander");
const puppeteer = require("puppeteer");
const fs = require("fs");
const http = require("http");
const https = require("https");

commander.option(
  "-s, --service <service>",
  "supported music service: migu, 163, kugou",
  "migu"
);

commander.parse(process.argv);
const options = commander.opts();

const name = options.service === undefined ? "migu" : options.service;

(async () => {
  const text = commander.args.join(" ");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  let searchUrl, musicUrl, downloadUrl;

  if (name === "kugou") {
    searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${text}`;
    await page.goto(searchUrl);
    await page.waitForSelector("body");

    const jsonData = await page.evaluate(
      () => document.querySelector("body").innerText
    );
    const { hash, album_id } = JSON.parse(jsonData).data.info[0];
    musicUrl = `https://www.kugou.com/song/#hash=${hash}&album_id=${album_id}`;
    await page.goto(musicUrl);
  } else if (name === "163") {
    searchUrl = `https://music.163.com/#/search/m/?s=${text}`;
    await page.goto(searchUrl);
    await page.waitForSelector(".g-iframe");

    const iframe = await page.frames().find((f) => f.name() === "contentFrame");
    const href = await iframe.evaluate(
      () => document.querySelector(".text > a")?.href
    );
    if (!href) {
      console.log("查无此歌曲");
      return await browser.close();
    }
    const id = href.split("=")[1];
    musicUrl = `http://music.163.com/song/media/outer/url?id=${id}.mp3`;
    await page.goto(musicUrl);
  } else {
    searchUrl = `https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do?&text=${text}&pageSize=1&searchSwitch={song:1}`;
    await page.goto(searchUrl);
    await page.waitForSelector("body");
    const jsonData = await page.evaluate(
      () => document.querySelector("body").innerText
    );
    const newRateFormats = JSON.parse(jsonData).songResultData?.result[0]
      .newRateFormats;
    if (!newRateFormats) {
      console.log("查无此歌曲");
      return await browser.close();
    }
    let hqSource;
    for (let format of newRateFormats) {
      if (format.formatType === "SQ" || format.formatType === "HQ") {
        hqSource = format;
      }
    }
    const { pathname } = new URL(hqSource.url || hqSource.androidUrl);
    downloadUrl = `https://freetyst.nf.migu.cn/${pathname}`;
  }
  const $http = name === "163" ? http : https;
  if (!(name === "migu")) {
    const selector = name === "kugou" ? "audio" : "video > source";
    downloadUrl = await page.evaluate(
      (el) => document.querySelector(el)?.src,
      selector
    );
  }
  if (!downloadUrl && name === "163") {
    console.log("vip歌曲无权限下载");
    return await browser.close();
  }
  $http.get(downloadUrl, (res) => {
    const stream = fs.createWriteStream(`${text}.mp3`);
    res.pipe(stream);
    stream.on("finish", () => {
      stream.close();
      console.log("下载成功");
    });
  });
  await browser.close();
})();