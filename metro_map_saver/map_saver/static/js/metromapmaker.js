// MetroMapMaker.js

var gridRows = 80, gridCols = 80;
var activeTool = 'look';
var activeMap = false;
var preferredGridPixelMultiplier = 20;
var lastStrokeStyle;
var lineWidth = 1.175;
var redrawOverlappingPoints = {};
var dragX = false;
var dragY = false;
var temporaryStation = {};

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
}; // String.replaceAll()

function resizeGrid(size) {
  // Change the grid size to the specified size.

  // Resize the grid and paint the map on it
  size = parseInt(size);
  gridRows = size;
  gridCols = size;

  // If the largest grid size changes, I'll need to change it here too
  for (var x=size;x<240;x++) {
    delete activeMap[x]
  }
  for (var x=0; x<size; x++) {
    for (var y=0; y<240; y++) {
      if (y >= size && activeMap[x] && activeMap[x][y]) {
        delete activeMap[x][y]
      }
    }
  }

  drawGrid()
  snapCanvasToGrid() 
  lastStrokeStyle = undefined; // Prevent odd problem where snapping canvas to grid would cause lines to paint with an undefined color (singletons were unaffected)

  $('.resize-grid').removeClass('btn-primary');
  $('.resize-grid').addClass('btn-info');
  $('#tool-resize-' + size).removeClass('btn-info');
  $('#tool-resize-' + size).addClass('btn-primary');

  drawCanvas(activeMap)
} // resizeGrid(size)

function resizeCanvas(zoomDirection) {
  // By resizing the #canvas-container, this will zoom in/out on the canvas

  // Get current size of the container
  var size = $('#canvas-container').width()

  step = gridCols

  // Check to see if there is overlap between the controls and the grid,
  //  if so, offer the option to move the toolbox
  if (isToolboxOverlappingCanvasContainer() && $('#snap-controls-left').is(':hidden') && $('#snap-controls-right').is(':hidden')) {
    $('#snap-controls-left').show()
  } 

  if (zoomDirection == 'out' && size >= 800) {
    size = size - step
  } else if (zoomDirection == 'in' && size <= 6400) {
    size = size + step
  }

  if (size < 800) {
    size = 800
  }
  if (size > 6400) {
    size = 6400
  }

  $('#canvas-container').width(size)
  $('#canvas-container').height(size)
} // resizeCanvas(zoomDirection)

function isToolboxOverlappingCanvasContainer() {
  // Is the toolbox overlapping the canvas-container?

  var canvasRect = document.getElementById('canvas-container').getBoundingClientRect()
  var toolboxRect = document.getElementById('controls').getBoundingClientRect()

  if (toolboxRect.left > (canvasRect.left + canvasRect.width)) {
    return false
  } else {
    return true
  }
}

function snapCanvasToGrid() {
  // Whenever the pixel width or height of the grid changes,
  // like on page load, map resize, or zoom in/out, 
  // the #metro-map-canvas size needs to be updated as well so they overlap

  // Resize the canvas as needed
  var canvas = document.getElementById('metro-map-canvas');
  var canvasStations = document.getElementById('metro-map-stations-canvas');
  if (canvas.height / gridCols != preferredGridPixelMultiplier) {
    // Maintain a nice, even gridPixelMultiplier so the map looks uniform at every size
    // On iPhone for Safari, canvases larger than 4096x4096 would crash, so cap it
    //  (this really only affects maps at 240x240)
    if (gridCols * preferredGridPixelMultiplier <= 4096) {
      canvas.height = gridCols * preferredGridPixelMultiplier;
      canvasStations.height = gridCols * preferredGridPixelMultiplier;
    } else {
      canvas.height = 4096;
      canvasStations.height = 4096;
    }
    if (gridRows * preferredGridPixelMultiplier <= 4096) {
      canvas.width = gridRows * preferredGridPixelMultiplier;
      canvasStations.width = gridRows * preferredGridPixelMultiplier;
    } else {
      canvas.width = 4096;
      canvasStations.width = 4096;
    }
  } // if canvas.height / gridCols != preferredGridPixelMultiplier

  $('#canvas-container').height($('#metro-map-canvas').height());
} // snapCanvasToGrid()

function getActiveLine(x, y, metroMap) {
  // Given an x, y coordinate pair, return the hex code for the line you're on.
  // Use this to retrieve the line for a given point on a map.
  if (metroMap && metroMap[x] && metroMap[x][y] && metroMap[x][y]["line"]) {
    return metroMap[x][y]["line"];
  } 
  else if (metroMap) {
    // metroMap was passed through but there was nothing at that x,y coordinate
    return undefined;
  }
  return false;
} // getActiveLine(x, y)

function moveLineStroke(ctx, x, y, lineToX, lineToY) {
  // Used by drawPoint() to draw lines at specific points
  ctx.moveTo(x * gridPixelMultiplier, y * gridPixelMultiplier);
  ctx.lineTo(lineToX * gridPixelMultiplier, lineToY * gridPixelMultiplier);
  singleton = false;
} // moveLineStroke(ctx, x, y, lineToX, lineToY)

function getStationLines(x, y) {
  // Given an x, y coordinate pair, return the hex codes for the lines this station services.
  return activeMap[x][y]["station"]["lines"]
} // getStationLines(x, y)

function bindRailLineEvents() {
  // Bind the events to all of the .rail-lines
  // Needs to be done whenever a new rail line is created and on page load
  $('.rail-line').click(function() {
    // Existing Rail Line
    activeTool = 'line';
    activeToolOption = $(this).css('background-color');
    $('#toolbox button').removeClass('btn-primary').addClass('btn-info');
    $('#tool-station-options').hide();
    $('#tool-station').html('<i class="fa fa-map-pin" aria-hidden="true"></i> Add/Edit Station');
  });  
} // bindRailLineEvents()

function makeLine(x, y) {
  // I need to clear the redrawArea first
  // BEFORE actually placing the line
  // The first call to drawArea() will erase the redrawSection
  // The second call actually draws the points
  drawArea(x, y, activeMap, true);
  var color = rgb2hex(activeToolOption).slice(1, 7);
  metroMap = updateMapObject(x, y, "line", color);
  autoSave(metroMap);
  drawArea(x, y, metroMap);
}

function makeStation(x, y) {
  // Use a temporary station and don't write to activeMap unless it actually has data
  //  this is how to make stations with no name go away on their own now that the grid is gone
  temporaryStation = {}
  if (!getActiveLine(x, y, activeMap)) {
    // Only expand the #tool-station-options if it's actually on a line
    $('#tool-station-options').hide();
    $('#tool-station').html('<i class="fa fa-map-pin" aria-hidden="true"></i> Add/Edit Station');
    drawCanvas(activeMap, true) // clear any stale station indicators
    return
  }

  $('#station-name').val('');
  $('#station-on-lines').html('');
  $('#station-coordinates-x').val(x);
  $('#station-coordinates-y').val(y);
  var allLines = $('.rail-line');

  if (!activeMap[x][y]["station"]) {
    // Create a new station
    temporaryStation = {
      "name": ""
    }

    // Set default orientation and transfer status
    $('#station-transfer').prop('checked', false);
    var lastStationOrientation = window.localStorage.getItem('metroMapStationOrientation');
    if (lastStationOrientation) {
      document.getElementById('station-name-orientation').value = lastStationOrientation;
      $('#station-name-orientation').change(); // This way, it will be saved
    } else {
      document.getElementById('station-name-orientation').value = '0';
    }

    // Pre-populate the station with the line it sits on
    activeLine = getActiveLine(x, y, activeMap);
    if (activeLine) {
      // If the station is added to a space with no rail line, don't add any active lines
      temporaryStation["lines"] = [activeLine];
      stationOnLines = "<button style='background-color: #" + activeLine + "' class='station-add-lines' id='add-line-" + activeLine + "'>" + $('#rail-line-' + activeLine).text() + "</button>";
      stationLines = [activeLine];

      // Pre-populate the station with its neighboring lines
      for (var nx=-1; nx<=1; nx+=1) {
        for (var ny=-1; ny<=1; ny+=1) {
          neighboringLine = getActiveLine(parseInt(x) + parseInt(nx), parseInt(y) + parseInt(ny), activeMap);
          if (neighboringLine) {
            if (stationOnLines && stationOnLines.indexOf(neighboringLine) >= 0) {
              // Don't add lines that are already added
            } else {
              stationOnLines += "<button style='background-color: #" + neighboringLine + "' class='station-add-lines' id='add-line-" + neighboringLine + "'>" + $('#rail-line-' + neighboringLine).text() + "</button>";
              stationLines.push(neighboringLine);
              temporaryStation["lines"].push(neighboringLine);
            }
          } // if (neighboringLine)
        } // for ny
      } // for nx
    } // if (activeLine)
  } // if (create new station)
  else {
    // Already has a station, so clicking again shouldn't clear the existing station but should allow you to rename it and assign lines
    if (activeMap[x][y]["station"]["name"]) {
      // This station already has a name, show it in the textfield
      var stationName = activeMap[x][y]["station"]["name"].replaceAll('_', ' ');
      $('#station-name').val(stationName);

      // Pre-check the box if this is a transfer station
      if (activeMap[x][y]["station"]["transfer"]) {
        $('#station-transfer').prop('checked', true);
      } else {
        $('#station-transfer').prop('checked', false);
      }

      // Select the correct orientation too.
      document.getElementById('station-name-orientation').value = activeMap[x][y]["station"]["orientation"];

      var stationOnLines = "";
      var stationLines = getStationLines(x, y);
      for (var z=0; z<stationLines.length; z++) {
        if (stationLines[z]) {
          stationOnLines += "<button style='background-color: #" + stationLines[z] + "' class='station-add-lines' id='add-line-" + stationLines[z] + "'>" + $('#rail-line-' + stationLines[z]).text() + "</button>";
        }
      }
    } // edit named station
  } // else (edit existing station)

  // Make the station options button collapsible
  if ($('#tool-station-options').is(':visible')) {
    $('#tool-station').html('<i class="fa fa-map-pin" aria-hidden="true"></i> Hide Station Options');
  }

  // Add lines to the "Other lines this station serves" option
  if (stationOnLines) {
    $('#station-on-lines').html(stationOnLines);

    var linesToAdd = "";

    for (var z=0; z<allLines.length; z++) {
      if ((stationLines == allLines[z].id.slice(10, 16) || stationLines.indexOf(allLines[z].id.slice(10,16)) >= 0) || allLines[z].id.slice(10,16) == 'new') {
        // Looping through all of the lines, if this line is already in the station's lines, don't add it
        // Don't add the "Add new line" button either
      } else {
        linesToAdd += '<button style="background-color: #' + allLines[z].id.slice(10, 16) + '" class="station-add-lines" id="add-line-' + allLines[z].id.slice(10, 16) + '">' + $('#' + allLines[z].id).text() + '</button>';
      }
    } // for allLines
    if (linesToAdd.length > 0) {
      $('#station-other-lines').html(linesToAdd);
      $('#add-other-lines').show()
      // Bind the event to the .station-add-lines buttons here since they are newly created.
      $('.station-add-lines').click(function() {
        if ($(this).parent().attr('id') == 'station-other-lines') {
          $('#station-on-lines').append($(this));
          if (Object.keys(temporaryStation).length > 0) {
            temporaryStation["lines"].push($(this).attr('id').slice(9, 15))
          } else {
            activeMap[x][y]["station"]["lines"].push($(this).attr('id').slice(9, 15))
          } // else (not temporaryStation)
        } else {
          // Remove it
          $('#station-other-lines').append($(this));
          var color = $(this).attr('id').slice(9, 15)
          if (Object.keys(temporaryStation).length > 0) {
            temporaryStation["lines"] = temporaryStation["lines"].filter(function(val) {
              return val !== color
            })
          } else {
            activeMap[x][y]["station"]["lines"] = activeMap[x][y]["station"]["lines"].filter(function(val) {
              return val !== color
            })
          } // else (not temporaryStation)
        } // else (remove station line)
        autoSave(activeMap)
      }); // .station-add-lines.click()
    } // if linesToAdd
    else {
      $('#add-other-lines').hide()
    } // not linesToAdd
  } // if stationOnLines

  // Now, there are two indicators for when a station has been placed on a line
  // and zero visual indicators for when a station gets placed on a blank square
  if (getActiveLine(x, y, activeMap)) {
    drawCanvas(activeMap, true);
    drawIndicator(x, y);
    $('#tool-station-options').show();
  }

  $('#station-name').focus(); // Set focus to the station name box to save you a click each time
} // makeStation(x, y)

function bindGridSquareEvents(event) {
  $('#station-coordinates-x').val('');
  $('#station-coordinates-y').val('');

  if (!event.isTrusted) {
    // This is a click + drag
    var xy = getCanvasXY(dragX, dragY)
  } else {
    var xy = getCanvasXY(event.pageX, event.pageY)
  }
  var x = xy[0]
  var y = xy[1]

  if (activeTool == 'line') {
    makeLine(x, y)
  } else if (activeTool == 'eraser') {
    // I need to check for the old line and station
    // BEFORE actually doing the erase operations
    erasedLine = getActiveLine(x, y, activeMap);
    if (activeMap && activeMap[x] && activeMap[x][y] && activeMap[x][y]["station"]) {
      var redrawStations = true;
    } else {
      var redrawStations = false;
    }
    metroMap = updateMapObject(x, y);
    autoSave(metroMap);
    drawArea(x, y, metroMap, erasedLine, redrawStations);
  } else if (activeTool == 'station') {
    makeStation(x, y)
  }
} // bindGridSquareEvents()

function bindGridSquareMouseover(event) {
  // $('#title').text(getCanvasXY(event.pageX, event.pageY)) // useful when debugging
  if (!mouseIsDown) {
    drawHoverIndicator(event.pageX, event.pageY)
  }
  if (mouseIsDown && (activeTool == 'line' || activeTool == 'eraser')) {
    dragX = event.pageX
    dragY = event.pageY
    $('#canvas-container').click()
  }
} // bindGridSquareMouseover()

function bindGridSquareMouseup() {
  // Workaround to give focus to #station-name after mousedown
  // Just don't steal focus away from another text box
  if (activeTool == 'station' && document.activeElement.type != 'text') {
    $('#station-name').focus()
  }
}

function drawHoverIndicator(x, y) {
  // Displays a hover indicator on the hover canvas at x,y
  var canvas = document.getElementById('hover-canvas')
  var ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 0.5
  ctx.fillStyle = '#2ECC71'
  var gridPixelMultiplier = canvas.width / gridCols
  xy = getCanvasXY(x, y)
  x = xy[0]
  y = xy[1]
  ctx.fillRect((x * gridPixelMultiplier) - (gridPixelMultiplier / 2), (y * gridPixelMultiplier) - (gridPixelMultiplier / 2), gridPixelMultiplier, gridPixelMultiplier)
} // drawHoverIndicator(x, y)

function drawGrid() {
  // Draws the gridlines on the canvas

  var canvas = document.getElementById('grid-canvas');
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = '#80CEFF'
  gridPixelMultiplier = canvas.width / gridCols;
  for (var x=0; x<gridCols; x++) {
    ctx.beginPath()
    ctx.moveTo((x * gridPixelMultiplier) + (gridPixelMultiplier / 2), 0);
    ctx.lineTo((x * gridPixelMultiplier) + (gridPixelMultiplier / 2), canvas.height);
    ctx.stroke()
    ctx.closePath()
  }
  for (var y=0; y<gridRows; y++) {
    ctx.beginPath()
    ctx.moveTo(0, (y * gridPixelMultiplier) + (gridPixelMultiplier / 2));
    ctx.lineTo(canvas.width, (y * gridPixelMultiplier) + (gridPixelMultiplier / 2));
    ctx.stroke()
    ctx.closePath()
  }

} // drawGrid()

function getRedrawSection(x, y, metroMap, redrawRadius) {
  // Returns an object that's a subset of metroMap
  // containing only the squares within redrawRadius of x,y
  redrawSection = {}
  redrawRadius = parseInt(redrawRadius)
  for (var nx=redrawRadius * -1; nx<=redrawRadius; nx+=1) {
    for (var ny=redrawRadius * -1; ny<=redrawRadius; ny+=1) {
      if (getActiveLine(x + nx, y + ny, metroMap)) {
        if (!redrawSection.hasOwnProperty(x + nx)) {
          redrawSection[x + nx] = {}
          redrawSection[x + nx][y + ny] = true;
        } else {
          redrawSection[x + nx][y + ny] = true;
        }
      }
    } // for ny
  } // for nx
  return redrawSection;
} // getRedrawSection(x, y, metroMap, redrawRadius)

function drawArea(x, y, metroMap, erasedLine, redrawStations) {
  // Partially draw an area centered on x,y
  // because it's faster than drawing the full canvas

  var canvas = document.getElementById('metro-map-canvas');
  var ctx = canvas.getContext('2d', {alpha: false});
  gridPixelMultiplier = canvas.width / gridCols;

  var redrawRadius = 1;

  x = parseInt(x);
  y = parseInt(y);

  ctx.lineWidth = gridPixelMultiplier * lineWidth;
  ctx.lineCap = 'round';

  if (activeTool == 'eraser') {
    if (erasedLine) {
      drawPoint(ctx, x, y, metroMap, erasedLine);
    } // if erasedLine
  } // if activeTool == 'eraser'

  // Determine redraw area and redraw the points that need to be redrawn
  redrawSection = getRedrawSection(x, y, metroMap, redrawRadius);
  for (var x in redrawSection) {
    for (var y in redrawSection[x]) {
      lastStrokeStyle = undefined; // I need to set lastStrokeStyle here, otherwise drawPoint() has undefined behavior
      x = parseInt(x);
      y = parseInt(y);
      if (activeTool == 'line' && erasedLine) {
        // When drawing lines, we call drawArea() twice.
        // First call: erase all the squares in the redrawSection
        // Second call: re-draw all the squares
        drawPoint(ctx, x, y, metroMap, getActiveLine(x,y, metroMap));
      } else {
        drawPoint(ctx, x, y, metroMap);
      } // else (of if activeTool is line and first pass)
    } // for y
  } // for x

  if (redrawStations) {
    // Did I erase a station? Re-draw them all here
    var canvasStations = document.getElementById('metro-map-stations-canvas');
    var ctxStations = canvasStations.getContext('2d', {alpha: true});
    ctxStations.clearRect(0, 0, canvasStations.width, canvasStations.height);
    ctxStations.font = '700 20px sans-serif';

    for (var x in metroMap){
      for (var y in metroMap[x]) {
        x = parseInt(x);
        y = parseInt(y);
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          continue;
        }
        drawStation(ctxStations, x, y, metroMap);
      } // for y
    } // for x
  } // if redrawStations
} // drawArea(x, y, metroMap, redrawStations)

function drawCanvas(metroMap, stationsOnly) {
  // Fully redraw the canvas based on the provided metroMap;
  //    if no metroMap is provided, then save the existing grid as a metroMap object
  //    then redraw the canvas
  if (stationsOnly) {
    // If I'm only changing the stations, I only need to update the stations canvas
  } else {
  var canvas = document.getElementById('metro-map-canvas');
  var ctx = canvas.getContext('2d', {alpha: false});

  // How much larger is the canvas than the grid has in squares?
  // If the grid has 80x80 squares and the canvas is 1600x1600,
  //    then the gridPixelMultiplier is 20 (1600 / 80)
  gridPixelMultiplier = canvas.width / gridCols; // 20

  // Clear the canvas, make the background white instead of transparent
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!metroMap) {
    metroMap = activeMap
  }
  activeMap = metroMap;

  ctx.lineWidth = gridPixelMultiplier * lineWidth;
  ctx.lineCap = 'round';

  for (var x in metroMap) {
    for (var y in metroMap[x]) {
      x = parseInt(x);
      y = parseInt(y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        continue;
      }
      drawPoint(ctx, x, y, metroMap);
    }
  }

  // Redraw select overlapping points
  // This solves the "Southeast" problem
  //  where if two adjacent lines were heading southeast, they would overlap
  //  in ways that didn't happen for two adjacent lines heading northeast
  var reversed = Object.keys(redrawOverlappingPoints).reverse();
  for (var i=0; i<reversed.length; i++) {
    var x = reversed[i];
    for (var y in redrawOverlappingPoints[x]) {
      x = parseInt(x);
      y = parseInt(y);
      drawPoint(ctx, x, y, metroMap);
    }
  }
  redrawOverlappingPoints = {};
  } // else (of if stationsOnly)
  // Draw the stations separately, or they will be painted over by the lines themselves.
  var canvas = document.getElementById('metro-map-stations-canvas');
  var ctx = canvas.getContext('2d', {alpha: true});
  ctx.font = '700 20px sans-serif';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (var x in metroMap){
    for (var y in metroMap[x]) {
      x = parseInt(x);
      y = parseInt(y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        continue;
      }
      drawStation(ctx, x, y, metroMap);
    } // for y
  } // for x

  // Add a map credit to help promote the site
  ctx.font = '700 20px sans-serif';
  ctx.fillStyle = '#000000';
  var mapCredit = 'Created with MetroMapMaker.com';
  var textWidth = ctx.measureText(mapCredit).width;
  ctx.fillText(mapCredit, (gridRows * gridPixelMultiplier) - textWidth, (gridCols * gridPixelMultiplier) - 50);

  // Has a shareable link been created for this map? If so, add it to the corner
  var shareableLink = document.getElementById('shareable-map-link');
  if (shareableLink) {
    shareableLink = shareableLink.text;
    if (shareableLink.length > 0 && shareableLink.slice(0, 26) == "https://metromapmaker.com/") {
      var remixCredit = 'Remix this map! Go to ' + shareableLink;
      var textWidth = ctx.measureText(remixCredit).width;
      ctx.fillText(remixCredit, (gridRows * gridPixelMultiplier) - textWidth, (gridCols * gridPixelMultiplier) - 25);
    }
  }
} // drawCanvas(metroMap)

function drawPoint(ctx, x, y, metroMap, erasedLine) {
  // Draw a single point at position x, y

  var activeLine = getActiveLine(x, y, metroMap);

  ctx.beginPath();

  if (!lastStrokeStyle || lastStrokeStyle != activeLine) {
    // Making state changes to the canvas is expensive
    // So only change it if there is no lastStrokeStyle,
    // or if the lastStrokeStyle doesn't match the activeLine
    ctx.strokeStyle = '#' + activeLine;
    lastStrokeStyle = activeLine;
  }

  if (erasedLine) {
    // Repurpose drawPoint() for erasing; use in drawArea()
    ctx.strokeStyle = '#ffffff';
    activeLine = erasedLine;
  }

  singleton = true;

  // Diagonals
  if (activeLine == getActiveLine(x + 1, y + 1, metroMap)) {
    // Direction: SE
    moveLineStroke(ctx, x, y, x+1, y+1);
    if (activeLine != getActiveLine(x + 1, y, metroMap) && getActiveLine(x + 1, y, metroMap)) {
      // If this southeast line is adjacent to a different color on its east,
      //  redraw these overlapping points later
      if (!redrawOverlappingPoints[x]) {
        redrawOverlappingPoints[x] = {}
      }
      redrawOverlappingPoints[x][y] = true;
    }
  } if (activeLine == getActiveLine(x - 1, y - 1, metroMap)) {
    // Direction: NW
    // Since the drawing goes left -> right, top -> bottom,
    //  I don't need to draw NW if I've drawn SE
    //  I used to cut down on calls to getActiveLine() and moveLineStroke()
    //  by just directly setting/getting singleton.
    // But now that I'm using drawPoint() inside of redrawArea(),
    // I can't rely on this shortcut anymore.
    moveLineStroke(ctx, x, y, x-1, y-1);
  } if (activeLine == getActiveLine(x + 1, y - 1, metroMap)) {
    // Direction: NE
    moveLineStroke(ctx, x, y, x+1, y-1);
  }  if (activeLine == getActiveLine(x - 1, y + 1, metroMap)) {
    // Direction: SW
    moveLineStroke(ctx, x, y, x-1, y+1);
  }

  // Cardinals
  if (activeLine == getActiveLine(x + 1, y, metroMap)) {
    // Direction: E
    moveLineStroke(ctx, x, y, x+1, y);
  } if (activeLine == getActiveLine(x - 1, y, metroMap)) {
    // Direction: W
    moveLineStroke(ctx, x, y, x-1, y);
  } if (activeLine == getActiveLine(x, y + 1, metroMap)) {
    // Direction: S
    moveLineStroke(ctx, x, y, x, y+1);
  } if (activeLine == getActiveLine(x, y - 1, metroMap)) {
    // Direction: N
    moveLineStroke(ctx, x, y, x, y-1);
  }

  if (singleton) {
    // Without this, singletons with no neighbors won't be painted at all.
    // So map legends, "under construction", or similar lines should be painted.
    if (erasedLine) {
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#' + activeLine;
    }
    ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .9, 0, Math.PI * 2, true); // Rail-line circle
    ctx.fill();
  } else {
    // Doing one stroke at the end once all the lines are known
    //  rather than several strokes will improve performance
    ctx.stroke();
  }

  ctx.closePath();
} // drawPoint(ctx, x, y, metroMap)

function drawStation(ctx, x, y, metroMap) {
  var isStation = metroMap[x][y]["station"];
  if (isStation) {
    var isTransferStation = metroMap[x][y]["station"]["transfer"];
  } else {
    return; // If it's not a station, I can end here.
  }

  if (isTransferStation) {
    // Outer circle
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * 1.2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    // Inner circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .9, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }

  // Outer circle
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .6, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();

  // Inner circle
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .3, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();

  // Write the station name
  ctx.fillStyle = '#000000';
  ctx.save();
  var activeStation = metroMap[x][y]["station"]["name"].replaceAll('_', ' ');

  // Rotate the canvas if specified in the station name orientation
  if (metroMap[x][y]["station"]["orientation"] == '-45') {
    ctx.translate(x * gridPixelMultiplier, y * gridPixelMultiplier);
    ctx.rotate(-45 * (Math.PI/ 180));
    if (isTransferStation) {
      ctx.fillText(activeStation, 30, 5);
    } else {
      ctx.fillText(activeStation, 15, 5);
    }
  } else if (metroMap[x][y]["station"]["orientation"] == '45') {
    ctx.translate(x * gridPixelMultiplier, y * gridPixelMultiplier);
    ctx.rotate(45 * (Math.PI/ 180));
    if (isTransferStation) {
      ctx.fillText(activeStation, 30, 5);
    } else {
      ctx.fillText(activeStation, 15, 5);
    }
  } else if (metroMap[x][y]["station"]["orientation"] == '135') {
    var textSize = ctx.measureText(activeStation).width;
    ctx.translate(x * gridPixelMultiplier, y * gridPixelMultiplier);
    ctx.rotate(-45 * (Math.PI/ 180));
    if (isTransferStation) {
      ctx.fillText(activeStation, -1 * textSize - 30, 5);
    } else {
      ctx.fillText(activeStation, -1 * textSize - 15, 5);
    }
  } else if (metroMap[x][y]["station"]["orientation"] == '180') {
    // When drawing on the left, this isn't very different from drawing on the right
    //      with no rotation, except that we measure the text first
    var textSize = ctx.measureText(activeStation).width;
    if (isTransferStation) {
      ctx.fillText(activeStation, (x * gridPixelMultiplier) - (gridPixelMultiplier * 1.5) - textSize, (y * gridPixelMultiplier) + gridPixelMultiplier / 4);
    } else {
      ctx.fillText(activeStation, (x * gridPixelMultiplier) - (gridPixelMultiplier) - textSize, (y * gridPixelMultiplier) + gridPixelMultiplier / 4);
    }
  } else  {
    if (isTransferStation) {
      ctx.fillText(activeStation, (x * gridPixelMultiplier) + (gridPixelMultiplier * 1.5), (y * gridPixelMultiplier) + gridPixelMultiplier / 4);
    } else {
      ctx.fillText(activeStation, (x * gridPixelMultiplier) + gridPixelMultiplier, (y * gridPixelMultiplier) + gridPixelMultiplier / 4);
    }
  } // else (of if station orientation is -45)

  ctx.restore();
} // drawStation(ctx, x, y, metroMap)

function drawIndicator(x, y) {
  // Place a temporary station marker on the canvas;
  // this will be overwritten by the drawCanvas() call
  // but at least there will be some visual indicator of the station's placement
  // now that the grid squares aren't visible
  var canvas = document.getElementById('metro-map-stations-canvas');
  var ctx = canvas.getContext('2d', {alpha: false});
  var gridPixelMultiplier = canvas.width / gridCols;

  if (!getActiveLine(x, y, activeMap)) {
    // If there is no activeLine, don't draw any symbol.
    // Stations must be placed on a line.
    return
  }

  if (temporaryStation["transfer"] || (activeMap[x][y]["station"] && activeMap[x][y]["station"]["transfer"])) {
    // Outer circle
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * 1.2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    // Inner circle
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .9, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }

  // Outer circle
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .6, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();

  // Inner circle
  ctx.fillStyle = '#00ff00'; // Bright green
  ctx.beginPath();
  ctx.arc(x * gridPixelMultiplier, y * gridPixelMultiplier, gridPixelMultiplier * .3, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();
} // drawIndicator(x, y)

function rgb2hex(rgb) {
    if (/^#[0-9A-F]{6}$/i.test(rgb)) return rgb;

    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    function hex(x) {
        return ("0" + parseInt(x).toString(16)).slice(-2);
    }
    return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
} // rgb2hex(rgb)

function autoSave(metroMap) {
  // Saves the provided metroMap to localStorage
  if (typeof metroMap == 'object') {
    activeMap = metroMap;
    metroMap = JSON.stringify(metroMap);
  }
  window.localStorage.setItem('metroMap', metroMap);
  $('#autosave-indicator').html('<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Saving ...');
  setTimeout(function() {
    $('#autosave-indicator').html('');
  }, 1500)
} // autoSave(metroMap)

function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}

function autoLoad() {
  // Attempts to load a saved map, in the order:
  // 1. from a URL parameter 'map' with a valid map hash
  // 2. from a map object saved in localStorage
  // 3. If neither 1 or 2, load a preset map (WMATA)

  snapCanvasToGrid();

  // Load from the savedMapData injected into the index.html template
  if (typeof savedMapData !== 'undefined') {
    activeMap = JSON.parse(savedMapData)
    getMapSize(activeMap)
    loadMapFromObject(activeMap)
    setTimeout(function() {
      $('#tool-resize-' + gridRows).text('Initial size (' + gridRows + 'x' + gridCols + ')');
    }, 1000)
    return
  }

  var savedMapHash = getURLParameter('map');
  if (savedMapHash) {
    $.get('/load/' + savedMapHash).done(function (savedMapData) {
      savedMapData = savedMapData.replaceAll(" u&#39;", "'").replaceAll("{u&#39;", '{"').replaceAll("\\[u&#39;", '["').replaceAll('&#39;', '"').replaceAll("'", '"').replaceAll('\\\\x', '&#x');
      if (savedMapData.replace(/\s/g,'').slice(0,7) == '[ERROR]') {
        // Fallback to an empty grid
        drawGrid();
        bindRailLineEvents();
        drawCanvas();
      } else {
        // This should no longer happen, but is available as a fallback
        getMapSize(savedMapData);
        loadMapFromObject(JSON.parse(savedMapData));
      }
    });
  } else if (window.localStorage.getItem('metroMap')) {
    // Load from local storage
    savedMapData = JSON.parse(window.localStorage.getItem('metroMap'));
    getMapSize(savedMapData);
    loadMapFromObject(savedMapData);
  } else {
    // If no map URLParameter and no locally stored map, default to the WMATA map
    // I think this would be more intuitive than the blank slate,
    //    and might limit the number of blank / red-squiggle maps created.
    // If the WMATA map ever changes, I'll need to update it here too.
    $.get('/load/s8JC8_z0').done(function (savedMapData) {
      savedMapData = savedMapData.replaceAll(" u&#39;", "'").replaceAll("{u&#39;", '{"').replaceAll("\\[u&#39;", '["').replaceAll('&#39;', '"').replaceAll("'", '"').replaceAll('\\\\x', '&#x');
      if (savedMapData.replace(/\s/g,'').slice(0,7) == '[ERROR]') {
        // Fallback to an empty grid
        drawGrid();
        bindRailLineEvents();
        drawCanvas();
      } else {
        getMapSize(savedMapData);
        loadMapFromObject(JSON.parse(savedMapData));
      }
    });
  }

  setTimeout(function() {
    $('#tool-resize-' + gridRows).text('Initial size (' + gridRows + 'x' + gridCols + ')');
  }, 1000);
} // autoLoad()

function getMapSize(metroMapObject) {
  // Sets gridRows and gridCols based on how far to the right map features have been placed
  // A map with x,y values within 0-79 will shrink to an 80x80 grid even if
  //    the grid has been extended beyond that
  var highestValue = 0;
  if (typeof metroMapObject !== 'object') {
    metroMapObject = JSON.parse(metroMapObject);
  }

  highestValue = Math.max(...Object.keys(metroMapObject).map(Number).filter(Number.isInteger).filter(function (key) {
    return Object.keys(metroMapObject[key]).length > 0
  }))
  for (var x in metroMapObject) {
    if (highestValue >= 200) { // If adding new map sizes, edit this!
      break
    }
    y = Math.max(...Object.keys(metroMapObject[x]).map(Number).filter(Number.isInteger).filter(
      function (key) {
      return Object.keys(metroMapObject[x][key]).length > 0
    }))
    if (y > highestValue) {
      highestValue = y;
    }
  }

  // If adding new map sizes, edit this!
  if (highestValue >= 200) {
    gridRows = 240, gridCols = 240;
  } else if (highestValue >= 160) {
    gridRows = 200, gridCols = 200;
  } else if (highestValue >= 120) {
    gridRows = 160, gridCols = 160;
  } else if (highestValue >= 80) {
    gridRows = 120, gridCols = 120;
  } else {
    gridRows = 80, gridCols = 80;
  }
  resizeGrid(gridRows)

  // Size the canvas container to the nearest multiple of gridCols
  $('#canvas-container').width(Math.round($('#canvas-container').width() / gridCols) * gridCols)
  $('#canvas-container').height(Math.round($('#canvas-container').height() / gridRows) * gridRows)
} // getMapSize(metroMapObject)

function loadMapFromObject(metroMapObject, update) {
  // Loads a map from the provided metroMapObject and 
  //  applies the necessary styling to the grid
  if (typeof metroMapObject != 'object') {
    metroMapObject = JSON.parse(metroMapObject);
  }

  if (!update) {
    drawGrid();
    if (Object.keys(metroMapObject['global']['lines']).length > 0) {
      // Remove original rail lines if the map has its own preset rail lines
      $('#tool-line-options button.original-rail-line').remove();
    }

    for (var line in metroMapObject['global']['lines']) {
      if (metroMapObject['global']['lines'].hasOwnProperty(line) && document.getElementById('rail-line-' + line) === null) {
          $('#rail-line-new').before('<button id="rail-line-' + line + '" class="rail-line btn-info" style="background-color: #' + line + ';">' + metroMapObject['global']['lines'][line]['displayName'] + '</button>');
      }
    }

    $(function () {
      $('[data-toggle="tooltip"]').tooltip({"container": "body"});
      bindRailLineEvents();
      drawCanvas(metroMapObject);
      var savedMapHash = getURLParameter('map');
      if ($('.visible-xs').is(':visible') && savedMapHash) {
        $('#canvas-container').removeClass('hidden-xs');
        $('#tool-export-canvas').click();
        $('#try-on-mobile').attr('disabled', false);
      } // if visible-xs && savedMapHash
    }); // Do this here because it looks like the call to this below doesn't happen in time to load all the tooltips created by the map being loaded
  } // if !update
} // loadMapFromObject(metroMapObject)

function updateMapObject(x, y, key, data) {
  // Intended to be a faster version of saveMapAsObject()
  // Instead of reconsituting the whole map object,
  //  just update what's at x,y

  if (activeMap) {
    var metroMap = activeMap;
  } else {
    // Don't request from localStorage unless we have to
    var metroMap = JSON.parse(window.localStorage.getItem('metroMap'));
  }

  if (activeTool == 'eraser') {
    if (!metroMap[x] || !metroMap[x][y]) {
      // Don't delete coordinates that have nothing there already
    } else {
      delete metroMap[x][y];
    }
    return metroMap;
  }

  if (!metroMap.hasOwnProperty(x)) {
    metroMap[x] = {};
    metroMap[x][y] = {};
  } else {
    if (!metroMap[x].hasOwnProperty(y)) {
      metroMap[x][y] = {};
    }
  }

  if (activeTool == 'line') {
    metroMap[x][y]["line"] = data;
  } else if (activeTool == 'station') {
    metroMap[x][y]["station"][key] = data;
  }

  return metroMap;
} // updateMapObject()

function moveMap(direction) {
    // Much faster and easier to read replacement
    //  of the old method of moving the map

    var xOffset = 0;
    var yOffset = 0;

    if (direction == 'left') {
        var xOffset = -1;
    } else if (direction == 'right') {
        var xOffset = 1;
    } else if (direction == 'down') {
        var yOffset = 1;
    } else if (direction == 'up') {
        var yOffset = -1;
    }

    newMapObject = {}
    for (var x in activeMap) {
      for (var y in activeMap[x]) {
        x = parseInt(x);
        y = parseInt(y);
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          continue;
        }

        if (!newMapObject[x + xOffset]) {
            newMapObject[x + xOffset] = {}
        }

        // If x,y is within the boundaries
        if ((0 <= x && x < gridCols && 0 <= y && y < gridCols)) {
          // If the next square is within the boundaries
          if (0 <= x + xOffset && x + xOffset < gridCols && 0 <= y + yOffset && y + yOffset < gridCols) {
            newMapObject[x + xOffset][y + yOffset] = activeMap[x][y];
          } // next within boundaries
        } // x,y within boundaries
      } // for y
    } // for x
    newMapObject["global"] = activeMap["global"];

    activeMap = newMapObject;
    drawCanvas(activeMap);
} // moveMap(direction)

function disableRightClick(event) {
  // Sometimes when creating a map it's too easy to accidentally right click and it's annoying
  event.preventDefault();
}

function enableRightClick() {
  document.getElementById('grid-canvas').removeEventListener('contextmenu', disableRightClick);
  document.getElementById('hover-canvas').removeEventListener('contextmenu', disableRightClick);
} // enableRightClick()

function getCanvasXY(pageX, pageY) {
  // Get an x, y coordinate from the canvas

  var container = $('#canvas-container')
  var width = container.width();
  var height = container.height();

  var xOffset = parseInt($('#main-container').css('padding-left'))
  var yOffset = parseInt($('#main-container').css('margin-top'))

  pageX = parseInt(pageX) - xOffset
  pageY = parseInt(pageY) - yOffset

  // Example: with width = 960 and gridCols = 160, round to the nearest 6 pixels
  var roundToNearest = width / gridCols

  pageX = Math.round(pageX / roundToNearest) * roundToNearest
  pageY = Math.round(pageY / roundToNearest) * roundToNearest

  var x = Math.floor(pageX / width * gridCols)
  var y = Math.floor(pageY / height * gridRows)

  if (x < 0) {
    x = 0
  } else if (x >= gridCols) {
    x = gridCols - 1
  }

  if (y < 0) {
    y = 0
  } else if (y >= gridRows) {
    y = gridRows - 1
  }

  return [x, y]
} // getCanvasXY(pageX, pageY)

$(document).ready(function() {

  document.getElementById('canvas-container').addEventListener('click', bindGridSquareEvents, false);
  // when exactly do I need mousedown? do I need it anymore?
  // document.getElementById('canvas-container').addEventListener('mousedown', bindGridSquareEvents, false);
  document.getElementById('canvas-container').addEventListener('mousemove', bindGridSquareMouseover, false);
  document.getElementById('canvas-container').addEventListener('mouseup', bindGridSquareMouseup, false);

  // Bind to the mousedown and mouseup events so we can implement dragging easily
  mouseIsDown = false;
  $(document).mousedown(function() {
      mouseIsDown = true;
  }).mouseup(function() {
      mouseIsDown = false;
  });

  autoLoad();

  $('.start-hidden').each(function() {
    $(this).hide();
  })

  // Disable right-click on the grid/hover canvases (but not on the map canvas/image)
  document.getElementById('grid-canvas').addEventListener('contextmenu', disableRightClick);
  document.getElementById('hover-canvas').addEventListener('contextmenu', disableRightClick);

  // Enable the tooltips
  $(function () {
    $('[data-toggle="tooltip"]').tooltip({"container": "body"});
  })

  activeTool = 'look';

  $('#toolbox button').click(function() {
    $('#toolbox button').removeClass('btn-primary').addClass('btn-info');
    $(this).removeClass('btn-info');
    $(this).addClass('btn-primary')
  })

  // Toolbox
  $('#tool-line').click(function() {
    // Expand Rail line options
    if ($('#tool-line-options').is(':visible')) {
      $('#tool-line-options').hide();
      $('#tool-new-line-options').hide();
      $('#tool-line').html('<i class="fa fa-pencil" aria-hidden="true"></i><i class="fa fa-subway" aria-hidden="true"></i> Draw Rail Line');
    } else {
      $('#tool-line-options').show();
      $('#tool-line').html('<i class="fa fa-subway" aria-hidden="true"></i> Hide Rail Line options');
    }
    $('.tooltip').hide();
  }); // #tool-line.click() (Show rail lines you can paint)
  $('#rail-line-delete').click(function() {
    // Only delete lines that aren't in use
    var allLines = $('.rail-line');
    var linesToDelete = [];
    var metroMap = Object.assign({}, activeMap) // make a copy so we can check to see which lines exist
    delete metroMap["global"]
    metroMap = JSON.stringify(metroMap)
    for (var a=0; a<allLines.length; a++) {
      if ($('.rail-line')[a].id != 'rail-line-new') {
        // Is this line in use at all?
        if (metroMap.indexOf('"line":"' + $('.rail-line')[a].id.slice(10, 16) + '"') == -1) {
          linesToDelete.push($('#' + $('.rail-line')[a].id));
          // Also delete unused lines from the "Add lines this station serves" section
          linesToDelete.push($('#add-line-' + [a].id));
          delete activeMap["global"]["lines"][$('.rail-line')[a].id.split("-").slice(2,3)]
        }
      }
    }
    if (linesToDelete.length > 0) {
      for (var d=0; d<linesToDelete.length; d++) {
        linesToDelete[d].remove();
      }
    }
  }); // #rail-line-delete.click() (Delete unused lines)
  $('#tool-station').click(function() {
    activeTool = 'station';
    if ($('#tool-station-options').is(':visible')) {
      $('#tool-station-options').hide();
      $('#tool-station').html('<i class="fa fa-map-pin" aria-hidden="true"></i> Add/Edit Station');
    }
    $('.tooltip').hide();
  }); // #tool-station.click()
  $('#tool-eraser').click(function() {
    activeTool = 'eraser';
    $('#tool-station-options').hide();
    $('#tool-station').html('<i class="fa fa-map-pin" aria-hidden="true"></i> Add/Edit Station');
    $('.tooltip').hide();
  }); // #tool-eraser.click()
  $('#tool-grid').click(function() {
    if ($('canvas#grid-canvas').hasClass('hide-gridlines')) {
      $('canvas#grid-canvas').removeClass('hide-gridlines');
      $('canvas#grid-canvas').css("opacity", 1);
      $('#tool-grid').html('<i class="fa fa-table" aria-hidden="true"></i> Hide grid');
    } else {
      $('canvas#grid-canvas').addClass('hide-gridlines');
      $('canvas#grid-canvas').css("opacity", 0);
      $('#tool-grid').html('<i class="fa fa-table" aria-hidden="true"></i> Show grid');
    }
    $('.tooltip').hide()
  }); // #tool-grid.click() (Toggle grid visibility)
  $('#tool-zoom-in').click(function() {
      resizeCanvas('in')
  }); // #tool-zoom-in.click()
  $('#tool-zoom-out').click(function() {
    resizeCanvas('out')
  }); // #tool-zoom-out.click()
  $('#snap-controls-left').click(function() {
    $('#controls').css("left", 5)
    $('#controls').css("right", "unset")
    $('.has-tooltip').each(function() {
      $(this).data('bs.tooltip').options.placement = 'right'
    })
    $(this).hide()
    $('#snap-controls-right').show()
  }); // #snap-controls-left.click()
  $('#snap-controls-right').click(function() {
    $('#controls').css("right", 5)
    $('#controls').css("left", "unset")
    $('.has-tooltip').each(function() {
      $(this).data('bs.tooltip').options.placement = 'left'
    })
    $(this).hide()
    $('#snap-controls-left').show()
  }); // #snap-controls-right.click()
  $('#tool-resize-all').click(function() {
    if ($('#tool-resize-options').is(':visible')) {
      $('#tool-resize-options').hide();
      $('#tool-resize-all').html('<i class="fa fa-expand" aria-hidden="true"></i> Resize grid');
    } else {
      $('#tool-resize-options').show();
      $('#tool-resize-all').html('<i class="fa fa-expand" aria-hidden="true"></i> Hide Resize options');
    }
    $('.tooltip').hide();
  }); // #tool-resize-all.click()
  $('.resize-grid').click(function() {
    size = $(this).attr('id').split('-').slice(2);
    // Indicate which size the map is now sized to, and reset any other buttons
    $('.resize-grid').each(function() {
      if ($(this).html().split(' ')[0] == 'Current') {
        var resizeButtonSize = $(this).attr('id').split('-').slice(2);
        var resizeButtonLabel = '(' + resizeButtonSize + 'x' + resizeButtonSize + ')';
        if (resizeButtonSize == 80) {
          resizeButtonLabel = 'Standard ' + resizeButtonLabel;
        } else if (resizeButtonSize == 120) {
          resizeButtonLabel = 'Large ' + resizeButtonLabel;
        } else if (resizeButtonSize == 160) {
          resizeButtonLabel = 'Extra Large ' + resizeButtonLabel;
        } else if (resizeButtonSize == 200) {
          resizeButtonLabel = 'XXL ' + resizeButtonLabel;
        } else if (resizeButtonSize == 240) {
          resizeButtonLabel = 'XXXL ' + resizeButtonLabel;
        }
        $(this).html(resizeButtonLabel);
      }
    })
    $(this).html('Current Size (' + size + 'x' + size + ')');
    resizeGrid(size);
  }); // .resize-grid.click()
  $('#tool-move-all').click(function() {
    if ($('#tool-move-options').is(':visible')) {
      $('#tool-move-options').hide();
      $('#tool-move-all').html('<i class="fa fa-arrows" aria-hidden="true"></i> Move map')
    } else {
      $('#tool-move-options').show();
      $('#tool-move-all').html('<i class="fa fa-arrows" aria-hidden="true"></i> Hide Move options')
    }
    $('.tooltip').hide();
  }); // #tool-move-all.click()
  $('#tool-move-up').click(function() {
    moveMap("up");
  }); // #tool-move-up.click()
  $('#tool-move-down').click(function() {
    moveMap("down");
  }); // #tool-move-down.click()
  $('#tool-move-left').click(function() {
    moveMap("left");
  }); // #tool-move-left.click()
  $('#tool-move-right').click(function() {
    moveMap("right");
  }); // #tool-move-right.click()
  $('#tool-save-map').click(function() {
    activeTool = 'look';
    var savedMap = JSON.stringify(activeMap);
    autoSave(savedMap);
    var saveMapURL = '/save/';
    $.post( saveMapURL, {
      'metroMap': savedMap
    }).done(function(data) {
      if (data.replace(/\s/g,'').slice(0,7) == '[ERROR]') {
        $('#tool-save-options').html('<h5 class="bg-danger">Sorry, there was a problem saving your map: ' + data.slice(9) + '</h5>');
        console.log("[WARN] Problem was: " + data)
        $('#tool-save-options').show();
      } else {
        data = data.split(',');
        var urlhash = data[0].replace(/\s/g,'');
        var namingToken = data[1].replace(/\s/g,'');
        var toolSaveOptions = '<button id="hide-save-share-url" class="btn btn-info">Hide sharing explanation</button><h5 style="overflow-x: hidden;" class="text-left">Map Saved! You can share your map with a friend by using this link: <a id="shareable-map-link" href="/?map=' + urlhash + '" target="_blank">https://metromapmaker.com/?map=' + urlhash + '</a></h5> <h5 class="text-left">You can then share this URL with a friend - and they can remix your map without you losing your original! If you make changes to this map, click Save and Share again to get a new URL.</h5>';
        if (namingToken) {
          // Only show the naming form if the map could actually be renamed.
          toolSaveOptions += '<form id="name-map" class="text-left"><input type="hidden" name="urlhash" value="' + urlhash + '"><input id="naming-token" type="hidden" name="naming_token" value="' + namingToken + '"><label for="name">Where is this a map of?</label><input id="user-given-map-name" type="text" name="name"><select id="user-given-map-tags" name="tags"><option value="">What kind of map is this?</option><option value="real">This is a real metro system</option><option value="speculative">This is a real place, but a fantasy map</option><option value="unknown">This is an imaginary place</option></select></form><button id="name-this-map" class="btn btn-warning btn-success">Name this map</button>'
        }
        var userGivenMapName = window.sessionStorage.getItem('userGivenMapName')
        var userGivenMapTags = window.sessionStorage.getItem('userGivenMapTags')

        if (namingToken && userGivenMapName && userGivenMapTags) {
          toolSaveOptions += '<h5><a id="map-somewhere-else">Not a map of ' + userGivenMapName + '? Click here to rename</a></h5>'
        }
        $('#tool-save-options').html(toolSaveOptions);

        // Pre-fill the name and tags with what we have in sessionStorage
        if (namingToken && userGivenMapName) {
          $('#user-given-map-name').val(userGivenMapName)
        }
        if (namingToken && userGivenMapTags) {
          $('#user-given-map-tags').val(userGivenMapTags)
        }

        $('#name-map').submit(function(e) {
          e.preventDefault();
        });
        $('#map-somewhere-else').click(function() {
          $('#name-map').show()
          $('#name-this-map').show()
          $(this).hide()
          $('#name-this-map').removeClass();
          $('#name-this-map').addClass('btn btn-warning btn-success');
          $('#name-this-map').text('Name this map')
        })
        $('#name-this-map').click(function(e) {

          // Sanitize the map name
          $('#user-given-map-name').val($('#user-given-map-name').val().replaceAll('<', '').replaceAll('>', '').replaceAll('"', '').replaceAll('\\\\', '').replace('&amp;', '&').replaceAll('&', '&amp;').replaceAll('/', '-').replaceAll("'", '')) // use similar replaces to $('#create-new-rail-line').click()

          var formData = $('#name-map').serializeArray().reduce(function(obj, item) {
              obj[item.name] = item.value;
              return obj;
          }, {});

          // Using sessionStorage instead of localStorage means that this will only survive for the current session and will expire upon browser close
          window.sessionStorage.setItem('userGivenMapName', $('#user-given-map-name').val())
          window.sessionStorage.setItem('userGivenMapTags', $('#user-given-map-tags').val())

          $.post('/name/', formData, function() {
            $('#name-map').hide();
            $('#name-this-map').removeClass('btn-warning');
            $('#name-this-map').text('Thanks!')
            setTimeout(function() {
              $('#name-this-map').hide();
            }, 500);
          });
        }) // #name-this-map.click()
        if (namingToken && userGivenMapName && userGivenMapTags) {
          $('#user-given-map-name').show()
          $('#user-given-map-tags').show()
          $('#name-this-map').click()
          $('#name-this-map').hide()
        }
        $('#tool-save-options').show();

        $('#hide-save-share-url').click(function() {
          $('#tool-save-options').hide()
        })
      }
    }).fail(function(data) {
      $('#tool-save-options').html('<h5 class="text-left bg-warning">Sorry, your map could not be saved right now. Metro Map Maker may be under maintenance. Please try again in a few minutes.</h5>');
      $('#tool-save-options').show();
    });
    $('.tooltip').hide();
  }); // $('#tool-save-map').click()
  $('#tool-export-canvas').click(function() {
    activeTool = 'look';
    drawCanvas(activeMap);
    $('#tool-station-options').hide();
    $('#tool-station').html('<i class="fa fa-map-pin" aria-hidden="true"></i> Add/Edit Station');

    $('.tooltip').hide();
    if ($('#grid-canvas').is(':visible')) {
      $('#grid-canvas').hide();
      $('#hover-canvas').hide();
      $('#metro-map-canvas').hide();
      $('#metro-map-stations-canvas').hide();
      var canvas = document.getElementById('metro-map-canvas');
      var canvasStations = document.getElementById('metro-map-stations-canvas');
      // Layer the stations on top of the canvas
      var ctx = canvas.getContext('2d', {alpha: false});
      ctx.drawImage(canvasStations, 0, 0);
      var imageData = canvas.toDataURL()
      $("#metro-map-image").attr("src", imageData);
      $("#metro-map-image").show();
      $('#export-canvas-help').show();
      $('button').attr('disabled', true);
      $(this).attr('disabled', false);
      $('#tool-export-canvas').html('<i class="fa fa-pencil-square-o" aria-hidden="true"></i> Edit map');
      $(this).attr('title', "Go back to editing your map").tooltip('fixTitle').tooltip('show');
    } else {
      $('#grid-canvas').show();
      $('#hover-canvas').show();
      $('#metro-map-canvas').show();
      $('#metro-map-stations-canvas').show();
      $("#metro-map-image").hide();
      $('#export-canvas-help').hide();
      $('button').attr('disabled', false);
      $('#tool-export-canvas').html('<i class="fa fa-file-image-o" aria-hidden="true"></i> Download as image');
      $(this).attr('title', "Download your map to share with friends").tooltip('fixTitle').tooltip('show');
    }
    // Hide the changed tooltip after a moment
    setTimeout(function() {
      $('.tooltip').hide();
    }, 1500);
  }); // #tool-export-canvas.click()
  $('#tool-clear-map').click(function() {
    gridRows = 80, gridCols = 80;
    activeMap = {
      "global": activeMap["global"]
    }
    drawGrid()
    snapCanvasToGrid()
    lastStrokeStyle = undefined;
    drawCanvas(activeMap)

    window.sessionStorage.removeItem('userGivenMapName');
    window.sessionStorage.removeItem('userGivenMapTags');
    
    $('.tooltip').hide();
  }); // #tool-clear-map.click()

  $('#rail-line-new').click(function() {
    if ($('#tool-new-line-options').is(':visible')) {
      $(this).text('+ Add New Line')
      $('#tool-new-line-options').hide()
    } else {
      $(this).text('Hide Add Line options')
      $('#tool-new-line-options').show()
    }
  }) // #rail-line-new.click() (expand tool-new-line-options)

  $('#create-new-rail-line').click(function() {

    $('#new-rail-line-name').val($('#new-rail-line-name').val().replaceAll('<', '').replaceAll('>', '').replaceAll('"', '').replaceAll('\\\\', '').replace('&amp;', '&').replaceAll('&', '&amp;').replaceAll('/', '-').replaceAll("'", '&#27;'));

    var allColors = [], allNames = [];
    $('.rail-line').each(function() {
      allColors.push($(this).attr('id').slice(10, 16));
      allNames.push($(this).text());
    });

    if ($('#new-rail-line-color').val() == '') {
      // If a color has not been selected, the line can be created but is undefined.
      // Set it to black instead since that's the default
      $('#new-rail-line-color').val('#000000');
    }

    if (allColors.indexOf($('#new-rail-line-color').val().slice(1, 7)) >= 0) {
      $('#tool-new-line-errors').text('This color already exists! Please choose a new color.');
    } else if (allNames.indexOf($('#new-rail-line-name').val()) >= 0) {
      $('#tool-new-line-errors').text('This rail line name already exists! Please choose a new name.');
    } else if ($('#new-rail-line-name').val().length == 0) {
      $('#tool-new-line-errors').text('This rail line name cannot be blank. Please enter a name.');
    } else if ($('#new-rail-line-name').val().length > 100) {
      $('#tool-new-line-errors').text('This rail line name is too long. Please shorten it.');
    } else if ($('.rail-line').length > 99) {
      $('#tool-new-line-errors').text('Too many rail lines! Delete your unused ones before creating new ones.');
    } else {
      $('#tool-new-line-errors').text('');
      $('#rail-line-new').before('<button id="rail-line-' + $('#new-rail-line-color').val().slice(1, 7) + '" class="rail-line btn-info" style="background-color: ' + $('#new-rail-line-color').val() + ';">' + $('#new-rail-line-name').val() + '</button>');
      activeMap['global'] = new Object();
      activeMap['global']['lines'] = new Object();
      $('.rail-line').each(function() {
        if ($(this).attr('id') != 'rail-line-new') {
          // rail-line-
          activeMap['global']['lines'][$(this).attr('id').slice(10, 16)] = {
            'displayName': $(this).text()
          }
        }
      });
    }
    // Re-bind events to .rail-line -- otherwise, newly created lines won't have events
    bindRailLineEvents();
  }); // $('#create-new-rail-line').click()

  $('#rail-line-change').click(function() {
    // Expand the options
    if ($('#tool-change-line-options').is(':visible')) {
      $(this).html('<i class="fa fa-pencil" aria-hidden="true"></i> Edit colors &amp; names')
      $('#tool-change-line-options').hide()
    } else {
      $(this).text('Close Edit Line options')
      $('#tool-change-line-options').show()
    }

    $('#tool-lines-to-change').html('<option>Edit which rail line?</option>')
    $('#change-line-name').hide()
    $('#change-line-color').hide()
    $('#tool-change-line-options h4').hide()

    // Now populate the select dropdown
    for (var line in activeMap["global"]["lines"]) {
      $('#tool-lines-to-change').append('<option value="' + line + '">' + activeMap["global"]["lines"][line]["displayName"] + '</option>')
    }
  }) // #rail-line-change.click()

  $('#tool-lines-to-change').change(function() {
    // Set the name and color
    if ($('#tool-lines-to-change option:selected').text() != 'Edit which rail line?') {
      $('#change-line-name').show()
      $('#change-line-color').show()
      $('#tool-change-line-options h4').show()
      $('#change-line-name').val($('#tool-lines-to-change option:selected').text())
      $('#change-line-color').val('#' + $(this).val())
    } else {
      $('#tool-change-line-options h4').hide()
      $('#change-line-name').hide()
      $('#change-line-color').hide()
    }
  }) // #tool-lines-to-change.change()

  $('#save-rail-line-edits').click(function() {
    // Save edits
    if ($('#tool-lines-to-change option:selected').text() != 'Edit which rail line?') {
      var lineColorToChange = $('#tool-lines-to-change').val()
      var lineColorToChangeTo = $('#change-line-color').val().slice(1)
      var lineNameToChange = $('#tool-lines-to-change option:selected').text()
      var lineNameToChangeTo = $('#change-line-name').val().replaceAll('<', '').replaceAll('>', '').replaceAll('"', '').replaceAll('\\\\', '').replace('&amp;', '&').replaceAll('&', '&amp;').replaceAll('/', '-').replaceAll("'", '&#27;') // use same replaces as in $('#create-new-rail-line').click()

      if ((lineColorToChange != lineColorToChangeTo) && (Object.keys(activeMap["global"]["lines"]).indexOf(lineColorToChangeTo) >= 0)) {
        $('#cant-save-rail-line-edits').text('Can\'t change ' + lineNameToChange + ' - it has the same color as ' + activeMap["global"]["lines"][lineColorToChangeTo]["displayName"])
      } else {
        replaceColors({
          "color": lineColorToChange,
          "name": lineNameToChange
        }, {
          "color": lineColorToChangeTo,
          "name": lineNameToChangeTo
        })
        $('#rail-line-change').html('<i class="fa fa-pencil" aria-hidden="true"></i> Edit colors &amp; names')
        $('#cant-save-rail-line-edits').text('')
        $('#tool-change-line-options').hide()
      }
    }
    
  }) // #save-rail-line-edits.click()

  $('#station-name').change(function() {
    // Remove characters that are invalid for an HTML element ID
    $(this).val($(this).val().replace(/[^A-Za-z0-9\- ]/g, ''));

    var x = $('#station-coordinates-x').val();
    var y = $('#station-coordinates-y').val();

    if (Object.keys(temporaryStation).length > 0) {
      activeMap[x][y]["station"] = Object.assign({}, temporaryStation)
      temporaryStation = {}
    }

    metroMap = updateMapObject(x, y, "name", $('#station-name').val().replaceAll(' ', '_'))
    autoSave(metroMap);
    drawCanvas(metroMap, true);
  }); // $('#station-name').change()

  $('#station-name-orientation').change(function() {
    var x = $('#station-coordinates-x').val();
    var y = $('#station-coordinates-y').val();

    const ALLOWED_ORIENTATIONS = ['0', '45', '-45', '135', '180'];

    if (x >= 0 && y >= 0) {
      if ($(this).val() == '0') {
        if (Object.keys(temporaryStation).length > 0) {
          temporaryStation["orientation"] = '0'
        } else {
          activeMap[x][y]["station"]["orientation"] = '0'
        }
      } else if (ALLOWED_ORIENTATIONS.indexOf($(this).val()) >= 0) {
        if (Object.keys(temporaryStation).length > 0) {
          temporaryStation["orientation"] = $(this).val()
        } else {
          activeMap[x][y]["station"]["orientation"] = $(this).val()
        } // else (not temporaryStation)
      } // else if ALLOWED_ORIENTATION
    } // if x >= 0 && y >= 0

    window.localStorage.setItem('metroMapStationOrientation', $(this).val());
    if (Object.keys(temporaryStation).length == 0) {
      autoSave(activeMap);
    }
    drawCanvas(activeMap, true);
    drawIndicator(x, y);
  }); // $('#station-name-orientation').change()

  $('#station-transfer').click(function() {
    var x = $('#station-coordinates-x').val();
    var y = $('#station-coordinates-y').val();
    if (x >= 0 && y >= 0 ) {
      if ($(this).is(':checked')) {
        if (Object.keys(temporaryStation).length > 0) {
         temporaryStation["transfer"] = 1
        } else {
          activeMap[x][y]["station"]["transfer"] = 1
        }
      } else {
        if (Object.keys(temporaryStation).length > 0) {
          delete temporaryStation["transfer"] 
        } else {
         delete activeMap[x][y]["station"]["transfer"]
        } // else (temporaryStation is blank)
      } // else (not checked)
    } // if x >= 0 && y >= 0

    if (Object.keys(temporaryStation).length == 0) {
      autoSave(activeMap)
    }

    drawCanvas(activeMap, true)
    drawIndicator(x, y);
  }); // $('#station-transfer').click()

}); // document.ready()

// Cheat codes / Advanced map manipulations
function getSurroundingLine(x, y, metroMap) {
  // Returns a line color only if x,y has two neighbors
  //  with the same color going in the same direction
  x = parseInt(x)
  y = parseInt(y)
  if (getActiveLine(x-1, y, metroMap) && (getActiveLine(x-1, y, metroMap) == getActiveLine(x+1, y, metroMap))) {
    // Left and right match
    return getActiveLine(x-1, y, metroMap);
  } else if (getActiveLine(x, y-1, metroMap) && (getActiveLine(x, y-1, metroMap) == getActiveLine(x, y+1, metroMap))) {
    // Top and bottom match
    return getActiveLine(x, y-1, metroMap);
  } else if (getActiveLine(x-1, y-1, metroMap) && (getActiveLine(x-1, y-1, metroMap) == getActiveLine(x+1, y+1, metroMap))) {
    // Diagonal: \
    return getActiveLine(x-1, y-1, metroMap);
  } else if (getActiveLine(x-1, y+1, metroMap) && (getActiveLine(x-1, y+1, metroMap) == getActiveLine(x+1, y-1, metroMap))) {
    // Diagonal: /
    return getActiveLine(x-1, y+1, metroMap);
  }
  return false;
} // getSurroundingLine(x, y, metroMap)

function stretchMap(metroMapObject) {
  // Stretch out a map
  // First, loop through all the keys and multiply them by 2
  // Next, loop through all the spaces and check:
  //   is that space surrounded by similar neighbors?
  //   if so, set that space equal to the color of its neighbors

  if (!metroMapObject) {
    metroMapObject = activeMap;
  }

  var newMapObject = {};
  for (var x in metroMapObject) {
    for (var y in metroMapObject[x]) {
      x = parseInt(x);
      y = parseInt(y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        continue;
      }
      if (!newMapObject.hasOwnProperty(x * 2)) {
        newMapObject[x * 2] = {}
      }
      newMapObject[x * 2][y * 2] = metroMapObject[x][y];
    } // for y
  } // for x

  // Set the gridRows and gridCols
  getMapSize(newMapObject)

  // Fill in the newly created in-between spaces
  for (var x=1;x<gridRows;x++) {
    for (var y=1;y<gridCols;y++) {
      var surroundingLine = getSurroundingLine(x, y, newMapObject);
      if (surroundingLine) {
        if (!newMapObject.hasOwnProperty(x)) {
          newMapObject[x] = {}
        }
        newMapObject[x][y] = {
          "line": surroundingLine
        }
      } // if neighboringLine
    } // for y
  } // for x

  newMapObject["global"] = metroMapObject["global"];
  activeMap = newMapObject;
  loadMapFromObject(newMapObject);
  return newMapObject;
} // stretchMap(metroMapObject)

function combineMap(urlhash) {
  // Add the map at the urlhash to the existing map.
  // Existing map must not be overwritten by the new map.
  // I expect this will mostly be used to bring terrain into an existing map
  // but this will only work for maps that are exactly aligned, or they will look a bit silly
  $.get('/load/' + urlhash).done(function (savedMapData) {
    savedMapData = savedMapData.replaceAll(" u&#39;", "'").replaceAll("{u&#39;", '{"').replaceAll("\\[u&#39;", '["').replaceAll('&#39;', '"').replaceAll("'", '"').replaceAll('\\\\x', '&#x');
    if (savedMapData.replace(/\s/g,'').slice(0,7) == '[ERROR]') {
      console.log("[WARN] Can't combine that map!");
    } else {
      savedMapData = JSON.parse(savedMapData)

      for (var x in savedMapData) {
        for (var y in savedMapData[x]) {
          if (!activeMap[x]) {
            activeMap[x] = {y: savedMapData[x][y]}
          } else if (activeMap[x] && !activeMap[x][y]) {
            activeMap[x][y] = savedMapData[x][y]
          }
        } // for y
      } // for x

      // Must also add the globals, otherwise the map probably won't be saveable
      for (var line in savedMapData["global"]["lines"]) {
        if (!activeMap["global"]["lines"][line]) {
          activeMap["global"]["lines"][line] = savedMapData["global"]["lines"][line]
        }
      }

      getMapSize(activeMap);
      loadMapFromObject(activeMap); // Must load not with update in order to update the map lines
      drawCanvas(activeMap);
    }
  });
} // combineMap(urlhash)

function replaceColors(color1, color2) {
    // Replaces all instances of color1 with color2.
    // Expects objects with keys name and color
    var savedMapData = JSON.stringify(activeMap);
    if (typeof color1 == 'object') {
      if (color1.name && color2.name) {
        if (color1.color) {
          $('#rail-line-' + color1.color).text(color2.name)
        }
        savedMapData = savedMapData.replaceAll('"displayName":"' + color1.name + '"', '"displayName":"' + color2.name + '"');
      }
      if (color1.color && color2.color && color1.color.match('[a-fA-F0-9]{6}') && color2.color.match('[a-fA-F0-9]{6}')) {
        savedMapData = savedMapData.replaceAll('"' + color1.color + '"', '"' + color2.color + '"');
      }
      if (color1.color != color2.color) {
        $('#rail-line-' + color1.color).remove()
      }
    } else {
      return
    }

    savedMapData = JSON.parse(savedMapData);
    activeMap = savedMapData;
    loadMapFromObject(activeMap);
    drawCanvas(activeMap);
    autoSave(activeMap);
} // replaceColors(color1, color2)

// Steer mobile users toward the gallery, for a better experience
$('#try-on-mobile').click(function() {
  $('#try-on-mobile').hide();
  $('#favorite-maps').hide();
  $('#toolbox-mobile-hint').removeClass('hidden-xs');
  $('#controls').removeClass('hidden-xs');

  // Needed if not viewing a specific map
  $('#canvas-container').removeClass('hidden-xs');
  snapCanvasToGrid();
});