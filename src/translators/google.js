import axios from "axios";
import { escapeHTML } from "../lib/scripts/common.js";

/**
 * Max retry times.
 */
const MAX_RETRY = 3;

/**
 * 翻译接口。
 */
const HOST = "https://translate.google.cn/";
const BASE_URL =
    HOST +
    "translate_a/single?ie=UTF-8&client=webapp&otf=1&ssel=0&tsel=0&kc=5&dt=t&dt=at&dt=bd&dt=ex&dt=md&dt=rw&dt=ss&dt=rm";

/**
 * Google translate interface.
 */
class GoogleTranslator {
    constructor() {
        // tk需要的密钥
        this.TKK = [434217, 1534559001];
    }

    /* eslint-disable */
    /**
     * Generate TK.
     *
     * @param {String} a parameter
     * @param {String} b parameter
     * @param {String} c parameter
     */
    generateTK(a, b, c) {
        b = Number(b) || 0;
        let e = [];
        let f = 0;
        let g = 0;
        for (; g < a.length; g++) {
            let l = a.charCodeAt(g);
            128 > l
                ? (e[f++] = l)
                : (2048 > l
                      ? (e[f++] = (l >> 6) | 192)
                      : (55296 == (l & 64512) &&
                        g + 1 < a.length &&
                        56320 == (a.charCodeAt(g + 1) & 64512)
                            ? ((l = 65536 + ((l & 1023) << 10) + (a.charCodeAt(++g) & 1023)),
                              (e[f++] = (l >> 18) | 240),
                              (e[f++] = ((l >> 12) & 63) | 128))
                            : (e[f++] = (l >> 12) | 224),
                        (e[f++] = ((l >> 6) & 63) | 128)),
                  (e[f++] = (l & 63) | 128));
        }
        a = b;
        for (f = 0; f < e.length; f++) {
            (a += e[f]), (a = this._magic(a, "+-a^+6"));
        }
        a = this._magic(a, "+-3^+b+-f");
        a ^= Number(c) || 0;
        0 > a && (a = (a & 2147483647) + 2147483648);
        a %= 1e6;
        return a.toString() + "." + (a ^ b);
    }

    /**
     * Generate magic number.
     *
     * @param {String} a parameter
     * @param {String} b parameter
     */
    _magic(a, b) {
        for (var c = 0; c < b.length - 2; c += 3) {
            var d = b.charAt(c + 2),
                d = "a" <= d ? d.charCodeAt(0) - 87 : Number(d),
                d = "+" == b.charAt(c + 1) ? a >>> d : a << d;
            a = "+" == b.charAt(c) ? (a + d) & 4294967295 : a ^ d;
        }
        return a;
    }
    /* eslint-enable */

    /**
     * Update TKK from Google translate page.
     */
    updateTKK() {
        return new Promise((resolve, reject) => {
            axios
                .get(HOST)
                .then(response => {
                    let body = response.data;
                    let tkk = (body.match(/TKK=(.*?)\(\)\)'\);/i) || [""])[0]
                        .replace(/\\x([0-9A-Fa-f]{2})/g, "") // remove hex chars
                        .match(/[+-]?\d+/g);
                    if (tkk) {
                        this.TKK[0] = Number(tkk[2]);
                        this.TKK[1] = Number(tkk[0]) + Number(tkk[1]);
                    } else {
                        tkk = body.match(/TKK[=:]['"](\d+?)\.(\d+?)['"]/i);
                        if (tkk) {
                            this.TKK[0] = Number(tkk[1]);
                            this.TKK[1] = Number(tkk[2]);
                        }
                    }
                    resolve();
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    /**
     * Parse Google translate result.
     *
     * @param {Object} response Google translate response
     */
    parseResult(response) {
        let result = new Object();
        for (let i = 0; i < response.length; i++) {
            if (response[i]) {
                let items = response[i];
                switch (i) {
                    // 单词的基本意思和音标
                    case 0:
                        let mainMeanings = [];
                        let originalTexts = [];
                        let lastIndex = items.length - 1;

                        for (let j = 0; j <= lastIndex; j++) {
                            mainMeanings.push(items[j][0]);
                            originalTexts.push(items[j][1]);
                        }
                        // 根据源文本将翻译结果格式化
                        result.mainMeaning = escapeHTML(mainMeanings.join("")).replace(
                            /\n|\r/g,
                            "<br/>"
                        );
                        result.originalText = escapeHTML(originalTexts.join(""));
                        try {
                            if (lastIndex > 0) {
                                if (items[lastIndex][2] && items[lastIndex][2].length > 0) {
                                    result.tPronunciation = escapeHTML(items[lastIndex][2]);
                                }

                                if (items[lastIndex][3] && items[lastIndex][3].length > 0) {
                                    result.sPronunciation = escapeHTML(items[lastIndex][3]);
                                }
                            }
                        } catch (error) {
                            // eslint-disable-next-line no-console
                            console.log(error);
                        }
                        // console.log("text: " + result.originalText + "\nmeaning: " + result.mainMeaning);
                        break;
                    // 单词的所有词性及对应的意思
                    case 1:
                        result.detailedMeanings = new Array();
                        items.forEach(item =>
                            result.detailedMeanings.push({
                                pos: item[0],
                                meaning: item[1].join(", ")
                            })
                        );
                        // console.log("detailedMeanings: " + JSON.stringify(result.detailedMeanings));
                        break;
                    case 2:
                        result.from = items;
                        // console.log(result.from);
                        break;
                    // 单词的定义及对应例子
                    case 12:
                        result.definitions = new Array();
                        items.forEach(item => {
                            item[1].forEach(element => {
                                result.definitions.push({
                                    pos: item[0],
                                    meaning: element[0],
                                    example: element[2]
                                });
                            });
                        });
                        // console.log("definitions: " + JSON.stringify(result.definitions));
                        break;
                    // 单词的例句
                    case 13:
                        result.examples = new Array();
                        items.forEach(item =>
                            item.forEach(element =>
                                result.examples.push({ source: null, target: element[0] })
                            )
                        );
                        // console.log("examples: " + JSON.stringify(result.examples));
                        break;
                    default:
                        break;
                }
            }
        }
        return result;
    }

    /**
     * Detect the language of given text.
     *
     * @param {String} text text to detect
     */
    detect(text) {
        let retryCount = 0;
        let detectOnce = () => {
            return new Promise((resolve, reject) => {
                let query = "&sl=auto&tl=zh-cn";
                query +=
                    "&tk=" +
                    this.generateTK(text, this.TKK[0], this.TKK[1]) +
                    "&q=" +
                    encodeURIComponent(text);

                axios
                    .get(BASE_URL + query)
                    .then(response => {
                        if (response.status === 200) {
                            resolve(response.data[2]);
                        } else if (response.status === 429 && retryCount < MAX_RETRY) {
                            retryCount++;
                            resolve(this.updateTKK().then(detectOnce));
                        } else reject(response);
                    })
                    .catch(error => {
                        reject(error);
                    });
            });
        };

        return detectOnce();
    }

    /**
     * Translate given text.
     *
     * @param {String} text text to translate
     * @param {String} from source language
     * @param {String} to target languaage
     */
    translate(text, from, to) {
        let retryCount = 0;
        let translateOnce = () => {
            return new Promise((resolve, reject) => {
                let query = "&sl=" + from + "&tl=" + to;
                query +=
                    "&tk=" +
                    this.generateTK(text, this.TKK[0], this.TKK[1]) +
                    "&q=" +
                    encodeURIComponent(text);

                axios
                    .get(BASE_URL + query)
                    .then(response => {
                        if (response.status === 200) {
                            let result = this.parseResult(response.data);
                            resolve(result);
                        } else if (response.status === 429 && retryCount < MAX_RETRY) {
                            retryCount++;
                            resolve(this.updateTKK().then(translateOnce));
                        } else reject(response);
                    })
                    .catch(error => {
                        reject(error);
                    });
            });
        };

        return translateOnce();
    }
}

/**
 * Create the default Translator object.
 */
const TRANSLATOR = new GoogleTranslator();
export default TRANSLATOR;
