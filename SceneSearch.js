﻿(function() {
    var pluginName = 'SceneSearch',
        serverPrefix = 'http://search.kosmosnimki.ru/',
        serverScript = serverPrefix + 'QuicklooksJson.ashx';

    _translationsHash.addtext('rus', {
        'SceneSearch.iconTitle' : 'Поиск снимков по экрану'
    });
    _translationsHash.addtext('eng', {
        'SceneSearch.iconTitle' : 'Find scene by screen'
    });

    var publicInterface = {
        pluginName: pluginName,
        afterViewer: function(params, map) {
            var path = gmxCore.getModulePath(pluginName);
            var _params = $.extend({
                regularImage: 'satellite.png',
                activeImage: 'satellite_a.png',
                layerName: null
            }, params);
            
            var layerName = _params.layerName;
            
            var gmxLayers,
                lmap, layersByID;
            if (!nsGmx.leafletMap) {    // для старого АПИ
                lmap = gmxAPI._leaflet.LMap;
                layersByID = gmxAPI.map.layers;
            } else {
                lmap = nsGmx.leafletMap;
                layersByID = nsGmx.gmxMap.layersByID;
            }

            var sideBar = new L.Control.gmxSidebar({className: 'scenesearch'}),
                div = L.DomUtil.create('div', pluginName + '-content'),
                filteringBox = L.DomUtil.create('div', pluginName + '-filtering-box', div),
                groupCmd = L.DomUtil.create('div', pluginName + '-group-cmd', filteringBox),
                gaussian = L.DomUtil.create('span', '', groupCmd),
                sharpen = L.DomUtil.create('span', '', groupCmd),
                edges = L.DomUtil.create('span', '', groupCmd),

                chartWrapper = L.DomUtil.create('div', pluginName + '-chart-wrapper', filteringBox),
                chartCanvas = L.DomUtil.create('canvas', pluginName + '-chart', chartWrapper),
                power = L.DomUtil.create('div', pluginName + '-power', chartWrapper),
                frequency = L.DomUtil.create('div', pluginName + '-frequency', chartWrapper),

                editorWrapper = L.DomUtil.create('div', pluginName + '-editor-wrapper', filteringBox),
                editorCanvas = L.DomUtil.create('canvas', pluginName + '-editor', editorWrapper),
                power = L.DomUtil.create('div', pluginName + '-power', editorWrapper),
                gain = L.DomUtil.create('div', pluginName + '-gain', editorWrapper),
                frequency2 = L.DomUtil.create('div', pluginName + '-frequency', editorWrapper),
                instructions = L.DomUtil.create('div', pluginName + '-instructions', editorWrapper),

                shap = L.DomUtil.create('div', pluginName + '-header', div),
                title = L.DomUtil.create('span', '', shap),
                refresh = L.DomUtil.create('i', 'icon-refresh', shap),
                filteringInputBox = L.DomUtil.create('div', pluginName + '-filtering-input-box', div),
                filtering = L.DomUtil.create('input', pluginName + '-filtering', filteringInputBox),
                filteringTitle = L.DomUtil.create('span', pluginName + '-filtering-title', filteringInputBox),
                image, selectName, selectID,
                curve, filterer, editor;

            refresh.title = 'Обновить';
            filtering.type = 'checkbox';
            filtering.onchange = function (ev) {
console.log('fffffff', ev);

            };
            filteringTitle.innerHTML = ' - фильтрация';
            power.innerHTML = 'Power';
            gain.innerHTML = 'Gain';
            frequency.innerHTML = 'Frequency';
            frequency2.innerHTML = 'Frequency';
            instructions.innerHTML = 'Click on curve to add points.<br/> Click and drag points to move them.';
            editorCanvas.width = chartCanvas.width = 720;
            editorCanvas.height = chartCanvas.height = 225;
/*            
            filteringBox.innerHTML += 
                '<div id="chart-wrapper">' +
                    '<canvas id="chart" width="720" height="225"></canvas>' +
                    '<div id="power" class="label">Power</div>' +
                    '<div id="frequency" class="label">Frequency</div>' +
                '</div>' +
                '<div id="editor-wrapper">' +
                    '<canvas id="editor" width="720" height="150"></canvas>' +

                    '<div id="gain" class="label">Gain</div>' +
                    '<div id="frequency2" class="label">Frequency</div>' +

                    '<div id="instructions">' +
                        'Click on curve to add points.<br/>' +
                        'Click and drag points to move them.' +
                    '</div>' +
                '</div>';
*/
            gaussian.innerHTML = 'Gaussian Blur';
            gaussian.onclick = function () {
                curve.setPoints([
                    [11, 76],
                    [56, 73],
                    [187, 17],
                    [314, 0]
                ]);
            };

            sharpen.innerHTML = 'Sharpen';
            sharpen.onclick = function () {
                curve.setPoints([
                    [173, 74],
                    [252, 79],
                    [416, 134],
                    [521, 142] 
                ]);
            };

            edges.innerHTML = 'Edge Detection';
            edges.onclick = function () {
                curve.setPoints([
                    [9, 0],
                    [41, 2],
                    [411, 122],
                    [675, 150]
                ]);
            };

            var getAnchors = function(p, type) {
                if (type === 1) {
                    return [[p.y1, p.x1], [p.y2, p.x2], [p.y3, p.x3], [p.y4, p.x4]];
                } else if (type === 3) {
                    return [[p.y2, p.x2], [p.y3, p.x3], [p.y4, p.x4], [p.y1, p.x1]];
                }
                var minx = Math.min(p.x1, p.x2, p.x3, p.x4),
                    maxx = Math.max(p.x1, p.x2, p.x3, p.x4),
                    miny = Math.min(p.y1, p.y2, p.y3, p.y4),
                    maxy = Math.max(p.y1, p.y2, p.y3, p.y4);
                
                if (type === 2) {
                    return [[maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]];
                }
                var sw = Math.max((maxx - minx), (maxy - miny)) / 2,
                    cx = (maxx + minx) / 2,
                    cy = (maxy + miny) / 2;
                return [[cy + sw, cx - sw], [cy + sw, cx + sw], [cy - sw, cx + sw], [cy - sw, cx - sw]];
            };

            publicInterface.setImage = function(p) {
                var sat_name = p.sat_name,
                    type = 0,
                    clipCoords = null;

                if (sat_name === 'WV02') {
                    type = p.is_local ? 1 : 0;
                } else if (sat_name === 'Pleiades') {
                    type = 3;
                } else if (sat_name === 'WV01' || sat_name === 'WV03' || sat_name === 'QB02') {
                    type = 0;
                } else if (sat_name === 'GE01' || sat_name === 'GE-1') {
                    type = p.is_local ? 1 : p.id.length == 16 ? 0 : 2;
                } else if (sat_name === 'SPOT 7'
                    || sat_name === 'SPOT 6'
                    || sat_name === 'SPOT 5'
                    || sat_name === 'EROS-B'
                    || sat_name === 'KOMPSAT3'
                    || sat_name === 'IK-2'
                    ) {
                    type = 1;
                }
                if (image && image._map) {
                    lmap.removeLayer(image);
                }

                if (p.geometry && p.geometry.type === 'POLYGON') {
                    var coords = p.geometry.coordinates[0];
                    clipCoords = coords.map(function(it) {
                        return it.reverse();
                    });
                }
                // var url = p.url;
                var url = 'http://search.kosmosnimki.ru/QuickLookImage.ashx?id=' + p.id;
//console.log('fffffff', p.url);
                
                L.gmxUtil.loaderStatus(url);
                image = L.imageTransform(url,
                    getAnchors(p, type),
                    { opacity: 1, clip: clipCoords, disableSetClip: false }
                    )
                    .on('load', function() {
                        L.gmxUtil.loaderStatus(url, true);

                        var resPtx = image._canvas.getContext('2d');
                        var canvas = L.DomUtil.create('canvas');
                        canvas.width = image._canvas.width;
                        canvas.height = image._canvas.height;
                        
                        filterer = new Filterer(canvas);
                                        
                        curve.addChangeListener(function () {
                            var filterArray = new Float32Array(CURVE_CANVAS_WIDTH);
                            curve.iterate(0, CURVE_CANVAS_WIDTH - 1, 1, function (x, y) {
                                filterArray[x] = Math.max(0.0, y / CURVE_CANVAS_HEIGHT * CURVE_SCALE);
                            });

                            chart.draw(curve);

                            filterer.filter(filterArray);
                            var img = new Image();
                            img.src = canvas.toDataURL("image/png");
                            resPtx.drawImage(img, 0, 0);
                    // console.log('curve', filterArray);
                        });
                        curve.triggerChangeListeners();
                        var powersByFrequency = filterer.setImage(image._imgNode);
                        chart.setData(powersByFrequency, curve);
                        curve.triggerChangeListeners();
                
                    }, this)
                    .addTo(lmap);
                
                lmap.fitBounds(image._bounds);
            };

            function getSceneList() {

                var cont = sideBar.getContainer();
                L.DomEvent.disableScrollPropagation(cont);
                cont.appendChild(div);
                title.innerHTML = 'Поиск снимков';
                
                var latLngBounds = lmap.getBounds(),
                    sw = latLngBounds.getSouthWest(),
                    ne = latLngBounds.getNorthEast();
                    min = {x: sw.lng, y: sw.lat},
                    max = {x: ne.lng, y: ne.lat},
                    //arr = bounds.toBBoxString().split(','),
                    oCalendar = nsGmx.widgets.getCommonCalendar(),
                    dt1 = oCalendar.getDateBegin(),
                    dt2 = oCalendar.getDateEnd();

                L.DomUtil.addClass(refresh, 'animate-spin');

                var minX = min.x,
                    maxX = max.x,
                    geo = {type: 'Polygon', coordinates: [[[minX, min.y], [minX, max.y], [maxX, max.y], [maxX, min.y], [minX, min.y]]]},
                    w = (maxX - minX) / 2;

                if (w >= 180) {
                    geo = {type: 'Polygon', coordinates: [[[-180, min.y], [-180, max.y], [180, max.y], [180, min.y], [-180, min.y]]]};
                } else if (maxX > 180 || minX < -180) {
                    var center = ((maxX + minX) / 2) % 360;
                    if (center > 180) { center -= 360; }
                    else if (center < -180) { center += 360; }
                    minX = center - w; maxX = center + w;
                    if (minX < -180) {
                        geo = {type: 'MultiPolygon', coordinates: [
                            [[[-180, min.y], [-180, max.y], [maxX, max.y], [maxX, min.y], [-180, min.y]]],
                            [[[minX + 360, min.y], [minX + 360, max.y], [180, max.y], [180, min.y], [minX + 360, min.y]]]
                        ]};
                    } else if (maxX > 180) {
                        geo = {type: 'MultiPolygon', coordinates: [
                            [[[minX, min.y], [minX, max.y], [180, max.y], [180, min.y], [minX, min.y]]],
                            [[[-180, min.y], [-180, max.y], [maxX - 360, max.y], [maxX - 360, min.y], [-180, min.y]]]
                        ]};
                    }
                }
                var geoJSON = {
                    "type":"FeatureCollection",
                    "features":[
                        {"type":"Feature","geometry": geo, "properties":{}}
                    ]
                };

                L.gmxUtil.sendCrossDomainPostRequest(serverScript,
                    {
                        WrapStyle: 'window',
                        geoJSON: JSON.stringify(geoJSON),
                        satellites: 'WV03,WV02,GE01,Pleiades,QB02,KOMPSAT3,IK-2,SPOT 6,SPOT 7,WV01,EROS-B,EROS-A1,SPOT 5',
                        spot5products: '5,4',
                        archive: 'global',
                        min_date: dt1.toJSON(),
                        max_date: dt2.toJSON(),
                        min_cloud_cover: 0,
                        max_cloud_cover: 100,
                        min_off_nadir: 0,
                        max_off_nadir: 60,
                        product: false,
                        source: true,
                        every_year: false
                    }
                , function(json) {
                    L.DomUtil.removeClass(refresh, 'animate-spin');
                    if (json) {
                        if (json.Status === 'ok' && json.Result) {
                            var satellites = {};
                            var values = json.Result;
                            if (selectName && selectName.parentNode) {
                                selectName.parentNode.removeChild(selectName);
                            }
                            if (selectID && selectID.parentNode) {
                                selectID.parentNode.removeChild(selectID);
                            }
                            if (L.Util.isArray(values)) {
                                selectName = L.DomUtil.create('select', pluginName + '-selectItem selectName', div);
                                var setIdsOpt = function(name) {
                                    var arr = satellites[name] || [];
                                    if (selectID && selectID.parentNode) {
                                        selectID.parentNode.removeChild(selectID);
                                    }
                                    selectID = L.DomUtil.create('select', pluginName + '-selectItem selectID', div);
                                    selectID.onchange = function() {
                                        var it = arr[selectID.selectedIndex];
                                        publicInterface.setImage(arr[selectID.selectedIndex]);
                                    };
                                    arr.map(function(it) {
                                        var opt = L.DomUtil.create('option', '', selectID);
                                        opt.setAttribute('id', it.id);
                                        opt.text = it.id;
                                    });
                                    selectID.onchange();
                                };
                                selectName.onchange = function(ev) {
                                    setIdsOpt(selectName.selectedOptions[0].id);
                                };

                                var satCount = 0;
                                values.map(function(it) {
                                    var name = it.sat_name;
                                    if (!satellites[name]) {
                                        satellites[name] = [];
                                        var opt = L.DomUtil.create('option', '', selectName);
                                        opt.setAttribute('id', name);
                                        opt.text = name;
                                        satCount++;
                                    }
                                    satellites[name].push(it);
                                });
                                if (selectName.selectedOptions[0]) {
                                    setIdsOpt(selectName.selectedOptions[0].id);
                                }
                                title.innerHTML = 'Найдено снимков: <b>' + values.length + '</b> (<b>' + satCount + '</b> спутников)';
                            } else if (values === 'exceeds') {
                                title.innerHTML = '<b>Ограничьте область поиска!</b>';
                            } else {
                                title.innerHTML = '<b>Данных не найдено!</b>';
                            }
                        } else {
                            title.innerHTML = '<b>Ошибка при получении данных!</b>';
                        }
                        if (json.ErrorInfo) {
                            title.innerHTML += '<br>' + json.ErrorInfo.ErrorMessage;
                        }
                    }
                });
            }
            L.DomEvent.on(refresh, 'click', getSceneList, this);

            var icon = new L.Control.gmxIcon({
                id: pluginName, 
                togglable: true,
                regularImageUrl: _params.regularImage.search(/^https?:\/\//) !== -1 ? _params.regularImage : path + _params.regularImage,
                activeImageUrl:  _params.activeImage.search(/^https?:\/\//) !== -1 ? _params.activeImage : path + _params.activeImage,
                title: _gtxt(pluginName + '.iconTitle')
            }).on('statechange', function(ev) {
                var isActive = ev.target.options.isActive;
                if (isActive) {
                    if (!window.Filterer) {
                        gmxCore.loadScript(path + '/filtering/shared.js');
                        gmxCore.loadScript(path + '/filtering/curve.js').then(function() {
console.log('curve', Curve);
                            curve = new Curve(editorCanvas, {
                                pointSize: 6,
                                pointColor: 'white',
                                selectionRadius: 20,
                                addDistance: 20,
                                overPointCursor: 'move',
                                overCurveCursor: 'crosshair',
                                defaultCursor: 'default',
                                curveColor: 'white',
                                backgroundColor: 'rgb(50, 50, 50)',
                                minSpacing: 5
                            });
                            curve.add(200, 75);
                        });
                        gmxCore.loadScript(path + '/filtering/filterer.js');
                        gmxCore.loadScript(path + '/filtering/chart.js').then(function() {
                            chart = new Chart(chartCanvas);
console.log('chart', chart);
                        });
                        if (!L.ImageTransform) {
                            gmxCore.loadScript(path + 'L.ImageTransform.js');
                        }
                    }
                    lmap.addControl(sideBar);
                    getSceneList();
                } else {
                    if (sideBar && sideBar._map) {
                        lmap.removeControl(sideBar);
                    }
                    if (image && image._map) {
                        lmap.removeLayer(image);
                    }
                }
            });
            lmap.addControl(icon);
        }
    };
    gmxCore.addModule(pluginName, publicInterface, {
        css: pluginName + '.css'
    });
})();