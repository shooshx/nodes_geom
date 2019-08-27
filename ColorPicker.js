"use strict"

var ColorPicker = (function(){

function addTextChild(elem, txt) {
    var dummy = document.createElement("DIV")
    dummy.innerHTML = txt
    var ne = dummy.firstChild
    elem.appendChild(ne)
    return ne
}

function addSiblingAfter(elem, txt) {
    var dummy = document.createElement("DIV")
    dummy.innerHTML = txt
    var ne = dummy.firstChild
    elem.parentNode.insertBefore(ne, elem.nextSibling)
    return ne
}

function HSVtoRGB(h, s, v, into) {
    var r, g, b, i, f, p, q, t;

    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    if (!into)
        into = {}
    into.r = Math.round(r * 255),
    into.g = Math.round(g * 255),
    into.b = Math.round(b * 255)
    return into
}


function RGBtoHSV(r, g, b) {
    r = r / 255;
    g = g / 255;
    b = b / 255;

    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, v = max, is_gray = false;

    var d = max - min;
    s = max === 0 ? 0 : d / max;

    if(max == min) {
        h = 0; // achromatic
        is_gray = true
    }
    else {
        switch(max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h, s: s, v: v, is_gray:is_gray };
}

var MARGIN = 10
var BAR_SZ = 18
var BAR_SPACE = 3
var ARROW_SZ = 5

function draw_chart(ctx, cfg, sel_col, sel_pos, presets) {
    ctx.fillStyle = "#bbb"
    ctx.fillRect(0, 0, cfg.sz, cfg.sz);
    
    var id = ctx.getImageData(0, 0, cfg.sz, cfg.sz)
    var d = id.data;
    
    var sq_sz = cfg.sz - MARGIN - MARGIN - BAR_SZ - BAR_SPACE
    cfg.sq_sz = sq_sz
    
    // square
    for(var x = 0; x < sq_sz; ++x) {
        for(var y = 0; y < sq_sz; ++y) {
            var rgb = HSVtoRGB(sel_col.h, x/sq_sz, (sq_sz-y)/sq_sz)
            var i = ((x+MARGIN) + (y+MARGIN)*cfg.sz)*4
            d[i] = rgb.r
            d[i+1] = rgb.g
            d[i+2] = rgb.b
        }
    }
    
    // hue bar
    cfg.bar_x = MARGIN+sq_sz+BAR_SPACE
    cfg.bar_y = MARGIN+sq_sz+BAR_SPACE
    for(var y = 0; y < sq_sz; ++y) {
        var rgb = HSVtoRGB(y/sq_sz, 1, 1)
        for(var x = 0; x < BAR_SZ; ++x) {
            var i = ((x+cfg.bar_x) + (y+MARGIN)*cfg.sz)*4
            d[i] = rgb.r
            d[i+1] = rgb.g
            d[i+2] = rgb.b        
        }
    }
    
    // square of selected color
    for(var x = 0; x < BAR_SZ; ++x) {
        for(var y = 0; y < BAR_SZ; ++y) {
            var i = ((x+cfg.bar_x) + (y+cfg.bar_y)*cfg.sz)*4
            d[i] = sel_col.r
            d[i+1] = sel_col.g
            d[i+2] = sel_col.b      
        }
    }

    ctx.putImageData(id, 0, 0)
        
    // circle selector in square   
    ctx.lineWidth = 1
    ctx.strokeStyle = sel_col.is_dark ? "#ffffff" : "#000000"
    ctx.beginPath()
    ctx.arc( sel_pos.sq_x * sq_sz + MARGIN, sel_pos.sq_y * sq_sz + MARGIN, 5, 0, 2*Math.PI)
    ctx.stroke();
    
    // arrow selector in bar
    var saturated_rgb = HSVtoRGB(sel_col.h, 1, 1)
    ctx.fillStyle = is_dark(saturated_rgb) ? "#ffffff" : "#000000"
    ctx.beginPath()
    var mid_y = sel_pos.bar_y * sq_sz + MARGIN
    
    ctx.moveTo(cfg.bar_x + ARROW_SZ, mid_y) // center
    ctx.lineTo(cfg.bar_x, mid_y - ARROW_SZ) // up
    ctx.lineTo(cfg.bar_x, mid_y + ARROW_SZ) // down
    //ctx.lineTo(cfg.bar_x + ARROW_SZ, mid_y)
    ctx.fill();
    
    // preset squares
    ctx.lineWidth = 1
    ctx.strokeStyle = '#000'

    cfg.preset_count = Math.trunc(sq_sz/BAR_SZ)
    for(var i = 0; i < cfg.preset_count; ++i) {
        var x = MARGIN + i*BAR_SZ + 1
        var y = cfg.bar_y
        if (presets[i] !== undefined) {
            ctx.fillStyle = presets[i].hex
            ctx.fillRect(x, y, BAR_SZ, BAR_SZ-1)
        }
        ctx.strokeRect(x + 0.5, y + 0.5, BAR_SZ, BAR_SZ-1)
    }
    
    // border of square of selected color
    ctx.strokeRect(cfg.bar_x + 0.5, cfg.bar_y + 0.5, BAR_SZ - 1, BAR_SZ-1)

}

function clamp(x) {
    if (x < 0)
        return 0;
    if (x > 1)
        return 1;
    return x;
}

// from https://github.com/antimatter15/rgb-lab/blob/master/color.js
function lab_L(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255,
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  
    var y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    y = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    y = (116 * y) - 16

    return y
}

function is_dark(c) {
    return lab_L(c) < 50
}

function make_hex(c) {
    return "#" + (Number(c.r).toString(16).padStart(2,'0') + Number(c.g).toString(16).padStart(2,'0') + Number(c.b).toString(16).padStart(2,'0')).toUpperCase()
}

function parse_hex(s) {
    if (s[0] == '#')
        s = s.substr(1)
    if (s.length == 6)
        return { r: parseInt(s.substr(0,2), 16), g: parseInt(s.substr(2,2), 16), b: parseInt(s.substr(4,2), 16) }
    if (s.length == 3) {
        return { r: parseInt(s[0]+s[0], 16), g: parseInt(s[1]+s[1], 16), b: parseInt(s[2]+s[2], 16) }
    }
    return null
}

function create_after(elem, sz, visible, onchange) {
    return create_at(elem, addSiblingAfter, sz, visible, onchange)
}
function create_as_child(elem, sz, visible, onchange) {
    return create_at(elem, addTextChild, sz, visible, onchange)
}

function create_at(elem, add_func, sz, visible, onchange) 
{
    var txt = '<canvas width="SZ" height="SZ" STYLE></canvas>'.replace(/SZ/g, sz)
                .replace(/STYLE/g, visible ? '' : 'style="display:none;"')
    var canvas = add_func(elem, txt)
    canvas.style.borderRadius = "7px"
    canvas.tabIndex = 0  // make it focusable
    canvas.style.outline = "none"  // but don't put a focus border on it
    var ctx = canvas.getContext("2d")
    var cfg = { sz:sz }
    var sel_col = { h:0, s:0, v:0, r:0, g:0, b:0 }
    var sel_pos = { sq_x: 0, sq_y: 0, bar_y: 0 } // range:0-1
    var presets = {}
    
    var col_from_pos = function() {
        sel_col.h = sel_pos.bar_y
        sel_col.s = sel_pos.sq_x
        sel_col.v = 1-sel_pos.sq_y
        HSVtoRGB(sel_col.h, sel_col.s, sel_col.v, sel_col)
        sel_col.is_dark = is_dark(sel_col);
        sel_col.hex = make_hex(sel_col)
        if (onchange)
            onchange(sel_col)
    }

    var get_color = function() {
        return sel_col
    }
    
    var set_color = function(c, do_onchange) {
        if (c === sel_col)
            return  // avoid infinite recursion though user code
        if (typeof c == "string")
            c = parse_hex(c)
        if (c === undefined || c == null)
            return
        sel_col = RGBtoHSV(c.r, c.g, c.b)
        sel_col.r = c.r
        sel_col.g = c.g
        sel_col.b = c.b
        sel_col.is_dark = is_dark(sel_col);
        sel_col.hex = make_hex(sel_col)
        
        sel_pos.sq_x = sel_col.s
        sel_pos.sq_y = 1-sel_col.v
        if (!sel_col.is_gray)  // if it doesn't have hue, don't move the hue bar
            sel_pos.bar_y = sel_col.h 
        else  // get the hue value from the UI instead
            sel_col.h = sel_pos.bar_y
        draw_chart(ctx, cfg, sel_col, sel_pos, presets)
        if (do_onchange && onchange)
            onchange(sel_col)
    }
    
    col_from_pos()
    draw_chart(ctx, cfg, sel_col, sel_pos, presets)

    // handle color change by draggin gand clicking
    var square_capture = false;
    var bar_capture = false;
    var mouse_act = function(e, isondown) {
        // if pressed, make sure it's pressed in us. If moving, make sure we're capturing it
        //console.log(canvas.id + "  capt=" + square_capture)
        if (!( (e.buttons == 1 && e.target === canvas) || square_capture || bar_capture))
            return false
        //console.log(canvas.id + " INNNN")
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        
        if (!bar_capture && (square_capture || (x > MARGIN && y > MARGIN && x < cfg.sq_sz+MARGIN && y < cfg.sq_sz+MARGIN))) {
            if (isondown)
                square_capture = true
            sel_pos.sq_x = clamp((x - MARGIN)/cfg.sq_sz)
            sel_pos.sq_y = clamp((y - MARGIN)/cfg.sq_sz)
            col_from_pos()
            draw_chart(ctx, cfg, sel_col, sel_pos, presets)
            return true
        }
        else if (bar_capture || (x > cfg.bar_x && y > MARGIN && x < cfg.bar_x + BAR_SZ && y < cfg.sq_sz+MARGIN)) {
            if (isondown)
                bar_capture = true
            sel_pos.bar_y = clamp((y - MARGIN)/cfg.sq_sz)
            col_from_pos()
            draw_chart(ctx, cfg, sel_col, sel_pos, presets)
            return true
        }
    }
    
    var mouse_move = function(e) {
        mouse_act(e)
    }
    document.addEventListener("mouseup", function(e) {
        square_capture = false;
        bar_capture = false;
        document.removeEventListener("mousemove", mouse_move)
        return true
    })
    
    canvas.onmousedown = function(e) {
        var do_capture = mouse_act(e, true)
        if (do_capture) {
            document.addEventListener("mousemove", mouse_move)
        }                
    }

    // handle presets click
    var next_preset_to_set = 0
    canvas.onmouseup = function(e) {
        if (e.which != 1)
            return
        var rect = e.target.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
    
        // on selected color
        if (x > cfg.bar_x && y > cfg.bar_y && x < cfg.bar_x + BAR_SZ && y < cfg.bar_y + BAR_SZ) {
            presets[next_preset_to_set] = { hex:sel_col.hex, r:sel_col.r, g:sel_col.g, b:sel_col.b }
            next_preset_to_set = (next_preset_to_set + 1) % cfg.preset_count
            draw_chart(ctx, cfg, sel_col, sel_pos, presets)
        }
        // presets bar
        if (x > MARGIN && y > cfg.bar_y && x < cfg.sq_sz && y < cfg.bar_y + BAR_SZ) {
            var xi = Math.trunc((x - MARGIN)/BAR_SZ)
            set_color(presets[xi], true)
        }
    }    
    
    var set_visible = function(v) {
        canvas.style.display = v ? 'initial':'none'
    }
    
    return { set_color:set_color, get_color:get_color, set_visible:set_visible, elem:canvas }
}

return { create_as_child:create_as_child, create_after:create_after }

})();


var ColorEditBox = (function(){

function create_at(edit_elem, sz, onchange) 
{
    var picker = ColorPicker.create_after(edit_elem, sz, false, function(c) { 
        if (document.activeElement != edit_elem)
            edit_elem.value = c.hex  // change the text only if we're not editing
        edit_elem.style.backgroundColor = c.hex
        edit_elem.style.color = c.is_dark ? "#fff" : "#000"
        if (onchange)
            onchange(c)
    })
    picker.elem.style.position = "fixed"
    var ed_rect = edit_elem.getBoundingClientRect()
    picker.elem.style.top = ed_rect.bottom + window.scrollY + 2 + "px"
    picker.elem.style.left = ed_rect.left + window.scrollX + "px"
    
    edit_elem.addEventListener("input", function() {
        picker.set_color(edit_elem.value, true)
    })
    
    edit_elem.addEventListener("focus", function() { picker.set_visible(true) })
    edit_elem.addEventListener("blur", function(e) { 
        if (e.relatedTarget !== picker.elem)  // if focus moved from the edit to something not the canvas, hide it
            picker.set_visible(false) 
    })
    
    picker.elem.addEventListener("focus", function() { 
        console.log("canvas-focus") 
    })
    picker.elem.addEventListener("blur", function(e) { 
        if (e.relatedTarget !== edit_elem)
            picker.set_visible(false) 
    })
    
    return picker
}

return { create_at:create_at }
})();






