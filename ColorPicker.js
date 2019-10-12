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


function RGBtoHSV(r, g, b, into) {
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
    into.h = h
    into.s = s
    into.v = v
    into.is_gray = is_gray;
}

var MARGIN = 10
var BAR_SZ = 18
var BAR_SPACE = 3 // space between bar and square
var ARROW_SZ = 5
var ALPHA_BAR_WIDTH = BAR_SZ + BAR_SPACE
const CHECKERS = { width:9, light:255, dark: 150 }

function draw_chart(ctx, cfg, sel_col, sel_pos, presets, options) {
    ctx.fillStyle = "#bbb"
    let width = cfg.sz, height = cfg.sz
    if (options.with_alpha)
        width += ALPHA_BAR_WIDTH
    ctx.fillRect(0, 0, width, height);
    
    var id = ctx.getImageData(0, 0, width, height)
    var d = id.data;
    
    var sq_sz = height - MARGIN - MARGIN - BAR_SZ - BAR_SPACE
    cfg.sq_sz = sq_sz
    
    // square
    for(var x = 0; x < sq_sz; ++x) {
        for(var y = 0; y < sq_sz; ++y) {
            var rgb = HSVtoRGB(sel_col.h, x/sq_sz, (sq_sz-y)/sq_sz)
            var i = ((x+MARGIN) + (y+MARGIN)*width)*4
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
            var i = ((x+cfg.bar_x) + (y+MARGIN)*width)*4
            d[i] = rgb.r
            d[i+1] = rgb.g
            d[i+2] = rgb.b        
        }
    }
    
    // square of selected color
    for(var x = 0; x < BAR_SZ; ++x) {
        for(var y = 0; y < BAR_SZ; ++y) {
            var i = ((x+cfg.bar_x) + (y+cfg.bar_y)*width)*4
            d[i] = sel_col.r
            d[i+1] = sel_col.g
            d[i+2] = sel_col.b      
        }
    }

    if (options.with_alpha) {
        cfg.alpha_bar_x = MARGIN+sq_sz+BAR_SPACE+BAR_SZ+BAR_SPACE
        for(var y = 0; y < sq_sz; ++y) {
            let alpha = 1 - y/(sq_sz-1)
            let ch_y = Math.trunc(y / CHECKERS.width) % 2
            for(var x = 0; x < BAR_SZ; ++x) {
                let ch_x = Math.trunc(x / CHECKERS.width) % 2
                let checkers = (ch_y == ch_x) ? CHECKERS.light : CHECKERS.dark
                var i = ((x+cfg.alpha_bar_x) + (y+MARGIN)*width)*4
                d[i] = sel_col.r*alpha + checkers*(1-alpha)
                d[i+1] = sel_col.g*alpha + checkers*(1-alpha)
                d[i+2] = sel_col.b*alpha + checkers*(1-alpha)
            }
        }        
    }

    if (options.with_null) {

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
    ctx.fill();

    if (options.with_alpha) {
        let alpha_mid_y = sel_pos.alpha_y * sq_sz + MARGIN
        ctx.beginPath()
        ctx.moveTo(cfg.alpha_bar_x + ARROW_SZ, alpha_mid_y) // center
        ctx.lineTo(cfg.alpha_bar_x, alpha_mid_y - ARROW_SZ) // up
        ctx.lineTo(cfg.alpha_bar_x, alpha_mid_y + ARROW_SZ) // down
        ctx.fill();
    }

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

function make_hex(c, force_no_alpha) {
    console.assert(!isNaN(c.r) && !isNaN(c.g) && !isNaN(c.b) && !isNaN(c.alpha))
    if (c.alpha == 1 || force_no_alpha)
        return "#" + (Number(c.r).toString(16).padStart(2,'0') + Number(c.g).toString(16).padStart(2,'0') + Number(c.b).toString(16).padStart(2,'0')).toUpperCase()
    else
        return "rgba(" + c.r + "," + c.g + "," + c.b + "," + c.alpha.toFixed(2) + ")"
}

function parse_hex(s) {
    let ret = null
    if (s === null)
        return null
    if (s[0] == 'r') {
        if (s.substr(0,4) == 'rbg(') {
            let sp = s.substr(4).split(',')
            ret = { r: parseInt(sp[0]), g: parseInt(sp[1]), b: parseInt(sp[2]), alpha:1, alphai:255 }
        }
        if (s.substr(0,5) == 'rgba(') {
            let sp = s.substr(5).split(',')
            let a = parseFloat(sp[3])
            ret = { r: parseInt(sp[0]), g: parseInt(sp[1]), b: parseInt(sp[2]), alpha:a, alphai:Math.round(a*255) }
        }
    }
    else {
        if (s[0] == '#')
            s = s.substr(1)
        if (s.length == 6)
            ret = { r: parseInt(s.substr(0,2), 16), g: parseInt(s.substr(2,2), 16), b: parseInt(s.substr(4,2), 16), alpha:1, alphai:255 }
        if (s.length == 3) {
            ret =  { r: parseInt(s[0]+s[0], 16), g: parseInt(s[1]+s[1], 16), b: parseInt(s[2]+s[2], 16), alpha:1, alphai:255 }
        }
    }
    if (ret != null && (isNaN(ret.r) || isNaN(ret.g) || isNaN(ret.b) || isNaN(ret.alpha)))
        return null
    return ret
}

function parse_hex_user(s) {
    let r = parse_hex(s)
    if (r === null)
        return null
    r.hex = make_hex(r)
    return r
}

function create_after(elem, sz, visible, onchange, options, start_value) {
    return create_at(elem, addSiblingAfter, sz, visible, onchange, options, start_value)
}
function create_as_child(elem, sz, visible, onchange, options, start_value) {
    return create_at(elem, addTextChild, sz, visible, onchange, options, start_value)
}

var CHECKERS_IMAGE = null

function create_checkers_image(canvas, ctx) {
    let orig_width = canvas.width, orig_height = canvas.height
    let w = CHECKERS.width, l = CHECKERS.light, d = CHECKERS.dark
    canvas.width = w*2
    canvas.height = w*2
    ctx.fillStyle = "rgb(" + l + "," + l + "," + l + ")"
    ctx.fillRect(0,0,w*2,w*2)
    ctx.fillStyle = "rgb(" + d + "," + d + "," + d + ")"
    ctx.fillRect(0,0,w,w)
    ctx.fillRect(w+1,w+1,w,w)
    CHECKERS_IMAGE = canvas.toDataURL('PNG')
    canvas.width = orig_width
    canvas.height = orig_height
}
function get_checkers_image() {
    return CHECKERS_IMAGE
}

var GLOBAL_PRESETS = {}

// options: { with_alpha:true/false, with_null:true/false, global_presets:true/false }
function create_at(elem, add_func, sz, visible, onchange, options, start_color) 
{
    if (options === undefined)
        options = {}
    let width=sz, height=sz
    if (options.with_alpha) 
        width += ALPHA_BAR_WIDTH
    if (options.global_presets !== false)
        options.global_presets = true
    
    var txt = '<canvas width="WIDTH" height="HEIGHT" STYLE></canvas>'.replace(/WIDTH/g, width).replace(/HEIGHT/g, height)
                .replace(/STYLE/g, visible ? '' : 'style="display:none;"')
    var canvas = add_func(elem, txt)
    canvas.style.borderRadius = "7px"
    canvas.tabIndex = 0  // make it focusable
    canvas.style.outline = "none"  // but don't put a focus border on it
    canvas.style.zIndex = 100  // don't allow other stuff from around to change the cursor
    var ctx = canvas.getContext("2d")

    //if (options.with_alpha && CHECKERS_IMAGE === null) 
    //    create_checkers_image(canvas, ctx) // for use in the html input element
    
    var cfg = { sz:sz }
    var sel_col = { h:0, s:0, v:0, r:null, g:null, b:null, alpha:1, alphai:255, hex:"", copy: function() {
        return { r:this.r, g:this.g, b:this.b, hex:this.hex, alpha:this.alpha, alphai:this.alphai }
    }}
    var sel_pos = { sq_x: 0, sq_y: 0, bar_y: 0, alpha_y: 0 } // range:0-1
    var presets = options.global_presets ? GLOBAL_PRESETS : {}
    
    var col_from_pos = function() {
        sel_col.h = sel_pos.bar_y
        sel_col.s = sel_pos.sq_x
        sel_col.v = 1-sel_pos.sq_y
        sel_col.alphai = Math.round((1-sel_pos.alpha_y)*255)
        sel_col.alpha = sel_col.alphai/255
        HSVtoRGB(sel_col.h, sel_col.s, sel_col.v, sel_col)
        sel_col.is_dark = is_dark(sel_col);
        sel_col.hex = make_hex(sel_col)
        sel_col.hex_no_alpha = make_hex(sel_col, true)
        if (onchange)
            onchange(sel_col)
    }

    var get_color = function() {
        return sel_col
    }
    
    var set_color = function(c, trigger_level1=true, trigger_level2=true) {
        if (c === sel_col)
            return  // avoid infinite recursion though user code
        if (typeof c == "string")
            c = parse_hex(c)
        if (c === undefined || c == null)
            return
        console.assert(c.r !== undefined && !isNaN(c.r) && c.g !== undefined && !isNaN(c.g) && c.b !== undefined && !isNaN(c.b))
        if (!is_first_change) // the following can happen on the first change if the input is nulls, we still want to draw the chart though
            if (c.r == sel_col.r && c.g == sel_col.g && c.b == sel_col.b && (c.alpha == sel_col.alpha || c.alphai == sel_col.alphai))
                return
        RGBtoHSV(c.r, c.g, c.b, sel_col)
        sel_col.r = c.r
        sel_col.g = c.g
        sel_col.b = c.b
        if (c.alpha !== undefined) {
            console.assert(!isNaN(c.alpha))
            sel_col.alpha = c.alpha
            sel_col.alphai = Math.round(c.alpha * 255)
        }
        else { // alphai is integer alpha in the range of [0-255]
            console.assert(c.alphai !== undefined && !isNaN(c.alphai))
            sel_col.alpha = c.alphai / 255
            sel_col.alphai = c.alphai
        }

        sel_col.is_dark = is_dark(sel_col);
        sel_col.hex = make_hex(sel_col)
        sel_col.hex_no_alpha = make_hex(sel_col, true)
        
        sel_pos.sq_x = sel_col.s
        sel_pos.sq_y = 1-sel_col.v
        if (!sel_col.is_gray)  // if it doesn't have hue, don't move the hue bar
            sel_pos.bar_y = sel_col.h 
        else  // get the hue value from the UI instead
            sel_col.h = sel_pos.bar_y
        sel_pos.alpha_y = 1-sel_col.alpha
        draw_chart(ctx, cfg, sel_col, sel_pos, presets, options)
        if (trigger_level1 && onchange)
            onchange(sel_col, trigger_level2)
    }

    let is_first_change = true
    set_color(start_color || "#cccccc", true, false) // need to_change in order to update the attached edit input
    is_first_change = false

    // handle color change by draggin gand clicking
    var square_capture = false;
    var bar_capture = false;
    var alpha_capture = false;
    var mouse_act = function(e, isondown) {
        // if pressed, make sure it's pressed in us. If moving, make sure we're capturing it
        //console.log(canvas.id + "  capt=" + square_capture)
        if (!( (e.buttons == 1 && e.target === canvas) || square_capture || bar_capture))
            return false
        //console.log(canvas.id + " INNNN")
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var changed = false
        if (!bar_capture && !alpha_capture && (square_capture || (x > MARGIN && y > MARGIN && x < cfg.sq_sz+MARGIN && y < cfg.sq_sz+MARGIN))) {
            if (isondown)
                square_capture = true
            sel_pos.sq_x = clamp((x - MARGIN)/cfg.sq_sz)
            sel_pos.sq_y = clamp((y - MARGIN)/cfg.sq_sz)
            changed = true
        }
        else if (bar_capture || (x > cfg.bar_x && y > MARGIN && x < cfg.bar_x + BAR_SZ && y < cfg.sq_sz+MARGIN)) {
            if (isondown)
                bar_capture = true
            sel_pos.bar_y = clamp((y - MARGIN)/cfg.sq_sz)
            changed = true
        }
        else if (alpha_capture || (options.with_alpha && x > cfg.alpha_bar_x && y > MARGIN && x < cfg.alpha_bar_x + BAR_SZ && y < cfg.sq_sz+MARGIN)) {
            if (isondown)
                alpha_capture = true
            sel_pos.alpha_y = clamp((y - MARGIN)/cfg.sq_sz)
            changed = true
        }

        if (changed) {
            col_from_pos()
            draw_chart(ctx, cfg, sel_col, sel_pos, presets, options)
        }
        return changed
    }
    
    var mouse_move = function(e) {
        mouse_act(e)
    }
    document.addEventListener("mouseup", function(e) {
        square_capture = false;
        bar_capture = false;
        alpha_capture = false;
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
    canvas.onmouseup = function(e) {
        if (e.which != 1)
            return
        var rect = e.target.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
    
        // on selected color
        if (x > cfg.bar_x && y > cfg.bar_y && x < cfg.bar_x + BAR_SZ && y < cfg.bar_y + BAR_SZ) {
            if (presets.next_to_set === undefined)
                presets.next_to_set = 0
            presets[presets.next_to_set] = { hex:sel_col.hex, r:sel_col.r, g:sel_col.g, b:sel_col.b, alpha:sel_col.alpha }
            presets.next_to_set = (presets.next_to_set + 1) % cfg.preset_count
            draw_chart(ctx, cfg, sel_col, sel_pos, presets, options)
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

return { create_as_child:create_as_child, create_after:create_after, parse_hex:parse_hex_user, get_checkers_image:get_checkers_image, 
         get_presets:()=>{ return GLOBAL_PRESETS }, set_presets:(v)=>{ GLOBAL_PRESETS=v} }

})();


var ColorEditBox = (function(){
var DEBUG_NO_BLUR = false
function create_at(edit_elem, sz, onchange, options, start_value) 
{
    var picker = ColorPicker.create_after(edit_elem, sz, false, function(c, trigger_level2=true) { 
        if (document.activeElement != edit_elem)
            edit_elem.value = c.hex  // change the text only if we're not editing
        edit_elem.style.backgroundColor = c.hex_no_alpha
        edit_elem.style.color = c.is_dark ? "#fff" : "#000"
        if (onchange && trigger_level2)
            onchange(c)
    }, options, start_value)
    picker.elem.style.position = "fixed"
    edit_elem.spellcheck = false
    function position_to_edit_elem() {
        var ed_rect = edit_elem.getBoundingClientRect()
        picker.elem.style.top = ed_rect.bottom + window.scrollY + 2 + "px"
        picker.elem.style.left = ed_rect.left + window.scrollX + "px"
    }

    let picker_set_color = picker.set_color
    picker.set_color = function(c, trigger=true) {
        picker_set_color(c, true, trigger) 
        // the edit box update always need to be updated, and the boolean actuall says if the outside onchange is triggered
    }
    
    edit_elem.addEventListener("input", function() {
        picker.set_color(edit_elem.value, true)
    })
    
    edit_elem.addEventListener("focus", function() { 
        position_to_edit_elem(); 
        picker.set_visible(true) 
    })
    if (!DEBUG_NO_BLUR) {
        edit_elem.addEventListener("blur", function(e) { 
            if (e.relatedTarget !== picker.elem)  // if focus moved from the edit to something not the canvas, hide it
                picker.set_visible(false) 
        })
    }
    
    picker.elem.addEventListener("focus", function() { 
        //console.log("canvas-focus") 
    })
    if (!DEBUG_NO_BLUR) {
        picker.elem.addEventListener("blur", function(e) { 
            if (e.relatedTarget !== edit_elem)
                picker.set_visible(false) 
        })
    }
    
    return picker
}

return { create_at:create_at }
})();






