import {getGlobal} from "../../shared/global";
import {
    WATCHDRIP_APP_ID,
    WATCHDRIP_CONFIG,
    WATCHDRIP_CONFIG_DEFAULTS,
    WATCHDRIP_CONFIG_LAST_UPDATE,
    WF_INFO,
    WF_INFO_LAST_UPDATE
} from "../config/global-constants";
import {json2str, str2json} from "../../shared/data";
import {COMMON_TITLE_TEXT} from "../config/styles";
import {MessageBuilder} from "../../shared/message";
import {
    Commands,
    DATA_STALE_TIME_MS,
    DATA_TIMER_UPDATE_INTERVAL_MS,
    DATA_UPDATE_INTERVAL_MS
} from "../config/constants";
import {debug, watchdrip} from "../../watchface/round";
import {WatchdripData} from "./watchdrip-data";
import {getRandomInt} from "../helper";

let {messageBuilder} = getApp()._options.globalData;

export const logger = Logger.getLogger("wf-wathchdrip");


export class Watchdrip {
    constructor() {
        this.timeSensor = hmSensor.createSensor(hmSensor.id.TIME);
        this.watchdripData = new WatchdripData(this.timeSensor);
        this.globalNS = getGlobal();

        this.system_alarm_id = null;
        this.lastInfoUpdate = 0;
        this.lastUpdateAttempt = null;
        this.lastUpdateSucessful = false;
        this.configLastUpdate = null;
        this.updatingData = false;

        this.intervalTimer = null;
        this.checkConfigUpdate();
        hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
            resume_call: this.widgetDelegateCallbackResumeCall,
            pause_call: this.widgetDelegateCallbackPauseCall,
        })
        this.initWidgets();
    }

    startDataUpdates() {
        if (this.intervalTimer != null) return; //already started
        debug.log("startDataUpdates");
        this.checkUpdates(); //start immediately
        this.intervalTimer = this.globalNS.setInterval(() => {
            this.checkUpdates();
        }, DATA_TIMER_UPDATE_INTERVAL_MS);
    }

    stopDataUpdates() {
        if (this.intervalTimer !== null) {
            debug.log("stopDataUpdates");
            this.globalNS.clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
    }

    openAPP() {
        const obj = {
            appid: WATCHDRIP_APP_ID,
            url: "pages/index",
        }

        debug.log("openAPP");
        hmApp.startApp(obj)
    }

    checkUpdates() {
        //debug.log("checkUpdates");
        if (this.updatingData) {
            debug.log("updatingData, return");
            return;
        }
        let lastInfoUpdate = hmFS.SysProGetInt64(WF_INFO_LAST_UPDATE);
        let utc = this.timeSensor.utc;
        if (!lastInfoUpdate) {
            if (this.lastUpdateAttempt == null) {
                debug.log("initial fetch");
                watchdrip.fetchInfo();
                return;
            }
            if (utc - this.lastUpdateAttempt > DATA_STALE_TIME_MS) {
                debug.log("the side app not responding, force update again");
                watchdrip.fetchInfo();
                return;
            }
        } else {
            if (!this.lastUpdateSucessful && this.lastUpdateAttempt !== null && (utc - this.lastUpdateAttempt > DATA_STALE_TIME_MS)) {
                debug.log("reached DATA_STALE_TIME_MS");
                watchdrip.fetchInfo();
                return;
            }
            if ((utc - lastInfoUpdate > DATA_UPDATE_INTERVAL_MS)) {
                debug.log("reached DATA_UPDATE_INTERVAL_MS");
                watchdrip.fetchInfo();
                return;
            }
            if (this.lastInfoUpdate === lastInfoUpdate) {
                //debug.log("data not modified");
                return;
            }
            watchdrip.fetchInfo();
        }


    }

    update() {
        this.checkConfigUpdate();
        debug.log(this.watchdripConfig)
        if (this.watchdripConfig != null) {
            // debug.enabled = this.watchdripConfig.showLog
            if (this.watchdripConfig.disableUpdates === true) {
                this.stopDataUpdates();
            } else {
                this.startDataUpdates();
            }
        }
    }

    startAppUpdate(isStartNow = false) {
        //debug.log("Update app info now:" + isStartNow);
        const obj = {
            appid: WATCHDRIP_APP_ID,
            url: "pages/index",
            param: "update"
        }
        if (isStartNow) {
            hmApp.startApp(obj)
        } else {
            obj.delay = 5000;
            this.system_alarm_id = hmApp.alarmNew(obj);
        }
        this.lastUpdateAttempt = this.timeSensor.utc;
    }

    initWidgets() {
        this.bgValTextWidget = hmUI.createWidget(hmUI.widget.TEXT, COMMON_TITLE_TEXT);
        this.drawGraph();
    }

    initConnection() {
        const appId = WATCHDRIP_APP_ID;
        messageBuilder = new MessageBuilder({appId});
        messageBuilder.connect();
    }

    widgetDelegateCallbackResumeCall() {
        debug.log("resume_call");
        watchdrip.initConnection();
        watchdrip.updatingData = false;
        watchdrip.update();
    }

    widgetDelegateCallbackPauseCall() {
        debug.log("pause_call");
        watchdrip.stopDataUpdates();
        watchdrip.updatingData = false;
        messageBuilder.disConnect();
    }

    updateWidgets() {
        debug.log("updateWidgets");
        this.bgValTextWidget.setProperty(hmUI.prop.MORE, {
            text: this.watchdripData.getBgVal(),
        });
    }

    drawGraph(){
         // const lineDatas = [
         //   { x: 0, y: 0 },
         //   { x: 100, y: 10, color: 0xfc6950 },
         //   { x: 200, y: 50, color: 0x1ad9cc },
         //   { x: 100, y: 2, item_color: 0x1ad9cc, item_width: 11},
         //   { x: 300, y: 50, width: 10 },
         // ];

        let pointWidth = 2;

         var widget = hmUI.createWidget(hmUI.widget.GRADKIENT_POLYLINE, {
           x: 0,
           y: 200,
           w: 480,
           h: 200,
             line_color: 0xfc6950, // ok
             line_width: pointWidth , // ok
             //type: 39, //spec val 5 , 27
         });
         var hLine = hmUI.createWidget(hmUI.widget.GRADKIENT_POLYLINE, {
            x: 0,
            y: 300,
            w: 480,
            h: 200,
            line_color: 0xBF0B0B, // ok
            line_width: pointWidth , // ok
            //type: 39, //spec val 5 , 27
        });
        var lLine = hmUI.createWidget(hmUI.widget.GRADKIENT_POLYLINE, {
            x: 0,
            y: 350,
            w: 480,
            h: 200,
            line_color: 0x008000, // ok
            line_width: pointWidth , // ok
            //type: 39, //spec val 5 , 27
        });

         widget.clear(); //clear the canvas
         // widget.addLine({
         // //   //Add line.
         //   data: lineDatas,
         //   count: lineDatas.length,
         //    line_color: 0x1ad9cc,
         //     item_color: 0x1ad9cc,
         //     color: 0x1ad9cc,
         //     item_width: 11,
         //     configs: {
         //         colors: [0x000000, 0xffffff],
         //         color_stops:1,
         //         color_count:2
         //     }
         // });

        let points = [];
        let xfinal = 480-pointWidth;
        let yfinal = 200-pointWidth;
        let pointIncrement= pointWidth+4
        for (let x = pointWidth/2; x < xfinal; x = x+pointIncrement) {
            for (let y = pointWidth/2; y < yfinal; y = y+pointIncrement) {
                // getRandomInt(10, 199)
                let point = {x: x, y: y}
                //logger.log("x:" + point[0].x + " y:" + point[0].y)
                points.push(point)
            }
        }

        widget.addPoint({
            data: points,
            count: points.length,
        })

        let linePoints = [{x: 0, y: 50}, {x: 480, y: 50}];
        hLine.addLine({
            data: linePoints,
            count: linePoints.length
            }
        )

        lLine.addLine({
                data: linePoints,
                count: linePoints.length
            }
        )

        /*
        hmUI.createWidget(hmUI.widget.HISTOGRAM, {
						x: (s - n(400)) / 2,
						y: 120,
						h: 300,
						w: 400,
						item_width: 11,
						item_space: 5,
						item_radius: 10,
						item_start_y: 50,
						item_max_height: 230,
						item_color: m < 0 ? this.state.red : this.state.green,
						data_array: o,
						data_count: 24,
						data_min_value: g - 100,
						data_max_value: c + 100,
						xline: {
							pading: 20,
							space: 20,
							start: 0,
							end: 300,
							color: this.state.black,
							width: 1,
							count: 15
						},
						yline: {
							pading: 10,
							space: 10,
							start: 0,
							end: 300,
							color: this.state.black,
							width: 1,
							count: 30
						},
						xText: {
							x: 12,
							y: 270,
							w: 20,
							h: 50,
							space: 10,
							align: hmUI.align.LEFT,
							color: this.state.black,
							count: 24,
							data_array: o
						},
						yText: {
							x: 0,
							y: 20,
							w: 50,
							h: 50,
							space: 10,
							align: hmUI.align.LEFT,
							color: this.state.black,
							count: 5,
							data_array: []
						}
					}
         */
    }

    fetchInfo() {
        this.lastUpdateAttempt = this.timeSensor.utc;
        this.lastUpdateSucessful = false;
        debug.log("fetchInfo");
        if (messageBuilder.connectStatus() === false) {
            debug.log("No bt connection");
            return;
        }
        debug.log("bt connection ok");
        this.updatingData = true;
        messageBuilder
            .request({
                method: Commands.getInfo,
            }, {
                timeout: 10000
            })
            .then((data) => {
                debug.log("received data");
                const {result: info = {}} = data;
                debug.log(info);
                try {
                    let data = str2json(info);
                    this.watchdripData.setData(data);
                    this.lastInfoUpdate = this.saveInfo(info);
                    let text = this.watchdripData.getBgTimestamp() + " " + this.watchdripData.getBgVal();
                    debug.log(text);
                    this.lastUpdateSucessful = true;
                    this.updateWidgets();
                } catch (e) {
                    debug.log("error:" + e);
                }
            })
            .catch((error) => {
                debug.log("fetch error:" + error);
            })
            .finally(() => {
                this.updatingData = false;
            });
    }

    saveInfo(info) {
        hmFS.SysProSetChars(WF_INFO, info);
        let time = this.timeSensor.utc;
        hmFS.SysProSetInt64(WF_INFO_LAST_UPDATE, time);
        return time;
    }

    readConfig() {
        var configStr = hmFS.SysProGetChars(WATCHDRIP_CONFIG);
        if (!configStr) {
            this.watchdripConfig = WATCHDRIP_CONFIG_DEFAULTS;
            this.saveConfig();
        } else {
            try {
                this.watchdripConfig = str2json(configStr);
            } catch (e) {

            }
        }
    }

    saveConfig() {
        hmFS.SysProSetChars(WATCHDRIP_CONFIG, json2str(this.watchdripConfig));
        hmFS.SysProSetChars(WATCHDRIP_CONFIG_LAST_UPDATE, this.timeSensor.utc);
    }

    checkConfigUpdate() {
        var configLastUpdate = hmFS.SysProGetInt64(WATCHDRIP_CONFIG_LAST_UPDATE);
        if (this.configLastUpdate !== configLastUpdate) {
            this.configLastUpdate = configLastUpdate;
            this.readConfig();
        }
    }

    onDestroy() {
        if (this.system_alarm_id !== null) {
            hmApp.alarmCancel(this.system_alarm_id);
        }
        this.stopDataUpdates();
    }
}