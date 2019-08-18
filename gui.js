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
    var p1_height = container.offsetHeight / 2 - GRIP_WIDTH
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
    var p1sz = container.offsetWidth / 2 - GRIP_WIDTH
    
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
    
    canvas_nodes.addEventListener('mousedown', function(e) {
        if (e.buttons == 1) {
            prev_x = e.pageX; prev_y = e.pageY
            hit = find_node_obj(nodes_view.view_x(e.pageX), nodes_view.view_y(e.pageY));
            if (hit != null) {
                console.log("hit ", hit)
                hit.mousedown()
                return
            }
            unselect_all()
            panning = true
        }
    });
    document.addEventListener('mouseup', function() {
        panning = false;
        if (hit !== null)
            hit.mouseup()            
        hit = null
    });
    document.addEventListener('mousemove', function(e) {
        var dx = e.pageX - prev_x, dy = e.pageY - prev_y
        prev_x = e.pageX, prev_y = e.pageY
        if (dx == 0 && dy == 0) 
            return
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
}

function addTextChild(elem, txt) {
    var dummy = document.createElement("DIV")
    dummy.innerHTML = txt
    var ne = dummy.firstChild
    elem.appendChild(ne)
    return ne
}


function open_context_menu(options, pgx, pgy, parent_elem)
{
    let text = "<div class='ctx_menu'>"
    for(let opt of options) {
        text += "<div class='ctx_menu_opt'>" + opt.text + "</div>"
    }
    text += "</div>" 
    
    let parent_width = parent_elem.offsetWidth, parent_height = parent_elem.offsetHeight
    let menu_elem = addTextChild(parent_elem, text)    
    for(let i = 0; i < menu_elem.childNodes.length; ++i) {
        menu_elem.childNodes[i].addEventListener('click', options[i].func)
    }
    
    let menu_width = menu_elem.offsetWidth, menu_height = menu_elem.offsetHeight
    var rx = pgx, ry = pgy
    
    if (pgx + menu_width > parent_width) {  // x overflow
        rx = parent_width - menu_width
    }
    if (pgy + menu_height > parent_height) { // y overflow
        ry = parent_height - menu_height
    }
    
    menu_elem.style.left = rx
    menu_elem.style.top = ry
    return menu_elem
}














