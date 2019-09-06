"use strict"

const GRIP_WIDTH = 5
const MIN_PANEL_SIZE = 10



function recalc_canvases_rects() {
    nodes_view.rect = canvas_nodes.getBoundingClientRect();
    image_view.rect = canvas_image.getBoundingClientRect();
}

var main_view_state = {
    split_1_h: 0.6,
    split_2_v: 0.35,

    save: function() { return { split_1_h: this.split_1_h, split_2_v: this.split_2_v } },
    load: function(v) { this.split_1_h = parseFloat(v.split_1_h); this.split_2_v = parseFloat(v.split_2_v) }
}

function setup_horz_splitter(container, p1, grip, p2, c2)
{    
    var p1_height = Math.trunc(container.offsetHeight * main_view_state.split_2_v) - GRIP_WIDTH
    var resize = function() {
        p1.style.height = p1_height + "px"
        var p2_height = container.offsetHeight - p1_height - GRIP_WIDTH
        p2.style.height = p2_height + "px"
        c2.height = p2_height
        c2.do_draw()
        recalc_canvases_rects()
    }
    resize()
    window.addEventListener('resize', resize);
 
    var moving = false;
    var startOffset;
    
    grip.addEventListener('mousedown', function(e) {
        moving = true;
        startOffset = p1.offsetHeight - e.pageY;
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });

    document.addEventListener('mousemove', function(e) {
      if (moving && e.pageY > MIN_PANEL_SIZE && e.pageY < container.offsetHeight - MIN_PANEL_SIZE) {
          p1_height = startOffset + e.pageY
          p1.style.height = p1_height + 'px';
          var p2_height = container.offsetHeight - p1_height - GRIP_WIDTH
          p2.style.height = p2_height + "px"
          c2.height = p2_height
          main_view_state.split_2_v = (p1_height + GRIP_WIDTH) / container.offsetHeight
          c2.do_draw()
          e.preventDefault(); // prevent selection action from messing it up
          recalc_canvases_rects()
      }
    });

}


function setup_vert_splitter(container, p1, c1, grip, p2, c2)
{
    var p1sz = Math.trunc(container.offsetWidth * main_view_state.split_1_h) - GRIP_WIDTH
    
    var resize = function() {
        p1.style.width = p1sz + "px"
        c1.width = p1sz
        c1.height = container.offsetHeight // Assumes image canvas takes the whole height
        c1.do_draw()
        var p2sz = container.offsetWidth - p1sz - GRIP_WIDTH
        p2.style.width = p2sz + "px"
        c2.width = p2sz
        c2.do_draw()
        recalc_canvases_rects()
    }
    resize()
    window.addEventListener('resize', resize);

    var moving = false;
    var startOffset;
    
    grip.addEventListener('mousedown', function(e) {
        moving = true;
        startOffset = p1.offsetWidth - e.pageX;
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });

    document.addEventListener('mousemove', function(e) {
      if (moving && e.pageX > MIN_PANEL_SIZE && e.pageX < container.offsetWidth - MIN_PANEL_SIZE) {
          p1sz = startOffset + e.pageX
          p1.style.width = p1sz + 'px';
          c1.width = p1sz
          c1.do_draw()
          var p2sz = container.offsetWidth - p1sz - GRIP_WIDTH
          p2.style.width = p2sz + "px"
          c2.width = p2sz
          main_view_state.split_1_h = (p1sz + GRIP_WIDTH) / container.offsetWidth
          c2.do_draw()
          e.preventDefault(); // prevent selection action from messing it up
          recalc_canvases_rects()
      }
    });
}

class ViewBase 
{
    constructor() {
        this.pan_x = null
        this.pan_y = null
        this.zoom = 1
        this.rect = null
    }

    view_x(pageX) {
        return pageX - nodes_view.rect.left - nodes_view.pan_x
    }
    view_y(pageY) {
        return pageY - nodes_view.rect.top - nodes_view.pan_y
    }
    save() {
        return { pan_x:this.pan_x, pan_y:this.pan_y }
    }
    load(s) {
        this.pan_x = parseInt(s.pan_x); this.pan_y = parseInt(s.pan_y)
    }
}

class NodesView extends ViewBase
{
    constructor(canvas) {
        super()
        this.pan_x = Math.round(canvas.width/2) // default before load from state
        this.pan_y = Math.round(canvas.height/2)

        this.find_obj = find_node_obj
        this.unselect_all = nodes_unselect_all
        this.context_menu = nodes_context_menu
        this.pan_redraw = draw_nodes
    }

    dismiss_popups() {
        nodes_dismiss_ctx_menu()
        nodes_dismiss_name_input()
    }
}

let nodes_view = null

class ImageView extends ViewBase
{
    constructor(canvas) {
        super()
        this.pan_x = 0
        this.pan_y = 0
        this.find_obj = function() { return null }
        this.unselect_all = function() {}
        this.context_menu = function() { return null }
        this.dismiss_popups = function() {}

        // viewport transform. don't use the canvas transform since we want stuff like vertex markers to remain the same size no matter what
        this.t_viewport = null       
        // distance from the top or from the left of a the largest square that fits in the canvas. only one of these would be non-zero
        // used for centering the viewport
        this.margin_x = 0
        this.margin_y = 0 
    }

    pan_redraw() {
        calc_img_viewport()
        trigger_frame_draw()        
    }
    resize_redraw() {
        this.pan_redraw()
    }
}

let image_view = null

function panel_mouse_control(view, canvas) 
{    
    var panning = false
    var prev_x, prev_y
    var hit = null
    var did_move = false  // used for detecting unselect
    
    canvas.addEventListener('mousedown', function(e) {
        if (e.buttons == 1) {
            prev_x = e.pageX; prev_y = e.pageY
            hit = view.find_obj(view.view_x(e.pageX), view.view_y(e.pageY));
            if (hit != null) {
                console.log("hit ", hit)
                hit.mousedown(e)
                return
            }
            did_move = false
            panning = true
        }
    });
    document.addEventListener('mouseup', function() {
        panning = false;
        if (hit !== null)
            hit.mouseup()  
        else if (!did_move)
            view.unselect_all(true)
        hit = null
    });
    document.addEventListener('mousemove', function(e) {
        var dx = e.pageX - prev_x
        var dy = e.pageY - prev_y
        dx /= view.zoom
        dy /= view.zoom
        prev_x = e.pageX, prev_y = e.pageY
        if (dx == 0 && dy == 0) 
            return
        did_move = true
        if (panning) {
            view.pan_x += dx
            view.pan_y += dy
            view.pan_redraw()
        }
        else if (hit !== null) {
            hit.mousemove(dx, dy, view.view_x(e.pageX), view.view_y(e.pageY))
        }
    })
    
    canvas.addEventListener("contextmenu", function(e) {
        let ctx = view.context_menu(view.view_x(e.pageX), view.view_y(e.pageY), e.pageX, e.pageY)
        if (ctx !== null)
            e.preventDefault()
        return false;
    })
    document.addEventListener('mousedown', function(e) {
        view.dismiss_popups()
    })
}

// https://github.com/jackmoore/wheelzoom/blob/master/wheelzoom.js
function panel_mouse_wheel(view, canvas)
{
    const zoom_factor = 0.10

    var mindim = Math.min(canvas.width, canvas.height)
    var bgWidth = mindim;
    var bgHeight = mindim;

    function onWarCanvasWheel(e) 
    {
        let bgPosX = view.pan_x * view.zoom
        let bgPosY = view.pan_y * view.zoom

        var deltaY = 0;
        e.preventDefault();
        if (e.deltaY) { // FireFox 17+ (IE9+, Chrome 31+?)
            deltaY = e.deltaY;
        } else if (e.wheelDelta) {
            deltaY = -e.wheelDelta;
        }
        // As far as I know, there is no good cross-browser way to get the cursor position relative to the event target.
        // We have to calculate the target element's position relative to the document, and subtrack that from the
        // cursor's position relative to the document.
        var rect = canvas.getBoundingClientRect();
        var offsetX = e.pageX - rect.left - window.pageXOffset;
        var offsetY = e.pageY - rect.top - window.pageYOffset;
        // Record the offset between the bg edge and cursor:
        //  from corner to cursor
        var bgCursorX = offsetX - bgPosX;
        var bgCursorY = offsetY - bgPosY;
        // Use the previous offset to get the percent offset between the bg edge and cursor:
        var bgRatioX = bgCursorX/bgWidth;
        var bgRatioY = bgCursorY/bgHeight;
        // Update the bg size:
        if (deltaY < 0) {
            bgWidth += bgWidth*zoom_factor;
            bgHeight += bgHeight*zoom_factor;
        } else {
            bgWidth -= bgWidth*zoom_factor;
            bgHeight -= bgHeight*zoom_factor;
        }

        // Take the percent offset and apply it to the new size:
        //  from cursor back to corner
        bgPosX = offsetX - (bgWidth * bgRatioX);
        bgPosY = offsetY - (bgHeight * bgRatioY);

        view.zoom = bgWidth / mindim;
        view.pan_x = bgPosX / view.zoom // don't know...
        view.pan_y = bgPosY / view.zoom

        view.pan_redraw()

    }
    canvas.addEventListener("wheel", onWarCanvasWheel)    
}


function addTextChild(elem, txt) {
    var dummy = document.createElement("DIV")
    dummy.innerHTML = txt
    var ne = dummy.firstChild
    elem.appendChild(ne)
    return ne
}


function open_context_menu(options, wx, wy, parent_elem, dismiss_func)
{
    let text = "<div class='ctx_menu'>"
    for(let opt of options) {
        text += "<div class='ctx_menu_opt'>" + opt.text + "</div>"
    }
    text += "</div>" 
    
    let parent_width = parent_elem.offsetWidth, parent_height = parent_elem.offsetHeight
    let menu_elem = addTextChild(parent_elem, text)    
    for(let i = 0; i < menu_elem.childNodes.length; ++i) {
        let child = menu_elem.childNodes[i]
        child.addEventListener('mousedown', function(e) {
            e.stopPropagation()            
        })
        child.addEventListener('click', function() {
            options[i].func()
            dismiss_func()
        })        
    }
    
    let menu_width = menu_elem.offsetWidth, menu_height = menu_elem.offsetHeight
    var rx = wx, ry = wy
    
    if (wx + menu_width > parent_width) {  // x overflow
        rx = parent_width - menu_width
    }
    if (wy + menu_height > parent_height) { // y overflow
        ry = parent_height - menu_height
    }
    
    menu_elem.style.left = rx + "px"
    menu_elem.style.top = ry + "px"
    return menu_elem
}

var last_name_input = null
function nodes_dismiss_name_input() {
    if (last_name_input != null && last_name_input.elem != null) {
        main_view.removeChild(last_name_input.elem)
        last_name_input = null
    }
}

class NameInput
{
    constructor(node, parent_elem) {
        this.node = node
        this.elem = null
    }
    mousedown(e) {
        e.stopPropagation() // don't want it to dismiss the NameInput we just opened
        nodes_dismiss_name_input()
        let text = "<div class='node_name_edit'><input class='node_name_input' type='text' spellcheck='false'></div>"
        this.elem = addTextChild(main_view, text)
        let input = this.elem.firstChild
        this.elem.style.left = this.node.namex() + nodes_view.rect.left + "px"
        this.elem.style.top = this.node.namey() + nodes_view.rect.top - 5 + "px"
        input.value = this.node.name
        input.addEventListener('mousedown', function(e) {
            e.stopPropagation()            
        })
        let that = this
        input.addEventListener('input', function() {
            that.node.set_name(input.value)
            draw_nodes()
        })
        last_name_input = this
    }
    mouseup() {
    }
    mousemove() {
    }
}

// pass along the messages to the node and just flip the display flag
class DisplayFlagProxy
{
    constructor(node) {
        this.node = node
    }
    mousedown(e) {
        set_display_node(this.node) 
        draw_nodes()
        // no need to draw_nodes since the selection of the node will do that
        this.node.mousedown(e)
    }
    mouseup() {
        this.node.mouseup()
    }
    mousemove(a,b,c,d) {
        this.node.mousemove(a,b,c,d)
    }
}

function setup_key_bindings()
{
    document.addEventListener("keypress", function(e) {
        if (e.key == ' ') {
            trigger_frame_draw()
        }
    })

}







