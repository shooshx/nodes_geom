"use strict"

const GRIP_WIDTH = 5
const MIN_PANEL_SIZE = 10

var image_canvas_rect = null

function recalc_canvases_rects() {
    nodes_view.rect = canvas_nodes.getBoundingClientRect();
    image_canvas_rect = canvas_image.getBoundingClientRect();
}

function setup_horz_splitter(container, p1, grip, p2, c2)
{    
    var p1_height = Math.trunc(container.offsetHeight *0.35) - GRIP_WIDTH
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
          c2.do_draw()
          e.preventDefault(); // prevent selection action from messing it up
          recalc_canvases_rects()
      }
    });

 
}

function setup_vert_splitter(container, p1, c1, grip, p2, c2)
{
    var p1sz = Math.trunc(container.offsetWidth *0.6) - GRIP_WIDTH
    
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
          c2.do_draw()
          e.preventDefault(); // prevent selection action from messing it up
          recalc_canvases_rects()
      }
    });
}


var nodes_view = {
    pan_x: 0,
    pan_y: 0,
    zoom: 1,
    rect: null,
    
    view_x: function(pageX) {
        return pageX - nodes_view.rect.left - nodes_view.pan_x
    },
    view_y: function(pageY) {
        return pageY - nodes_view.rect.top - nodes_view.pan_y
    }
}

function nodes_panel_mouse_control() 
{
    nodes_view.pan_x = Math.round(canvas_nodes.width/2)
    nodes_view.pan_y = Math.round(canvas_nodes.height/2)
    
    var panning = false
    var prev_x, prev_y
    var hit = null
    var did_move = false  // used for detecting unselect
    
    canvas_nodes.addEventListener('mousedown', function(e) {
        if (e.buttons == 1) {
            prev_x = e.pageX; prev_y = e.pageY
            hit = find_node_obj(nodes_view.view_x(e.pageX), nodes_view.view_y(e.pageY));
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
            unselect_all(true)
        hit = null
    });
    document.addEventListener('mousemove', function(e) {
        var dx = e.pageX - prev_x, dy = e.pageY - prev_y
        prev_x = e.pageX, prev_y = e.pageY
        if (dx == 0 && dy == 0) 
            return
        did_move = true
        if (panning) {
            nodes_view.pan_x += dx
            nodes_view.pan_y += dy
            draw_nodes()
        }
        else if (hit !== null) {
            hit.mousemove(dx, dy, nodes_view.view_x(e.pageX), nodes_view.view_y(e.pageY))
        }
    })
    
    canvas_nodes.addEventListener("contextmenu", function(e) {
        nodes_context_menu(nodes_view.view_x(e.pageX), nodes_view.view_y(e.pageY), e.pageX, e.pageY)
        e.preventDefault()
        return false;
    })
    document.addEventListener('mousedown', function(e) {
        nodes_dismiss_ctx_menu()
        nodes_dismiss_name_input()
    })
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








