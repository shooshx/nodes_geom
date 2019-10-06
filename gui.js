"use strict"

const GRIP_WIDTH = 5
const MIN_PANEL_SIZE = 10



function recalc_canvases_rects() {
    nodes_view.rect = canvas_nodes.getBoundingClientRect();
    image_view.rect = canvas_image.getBoundingClientRect();
    canvas_webgl.width = canvas_image.width
    canvas_webgl.height = canvas_image.height
}

var main_view_state = {
    split_1_h: 0.6,
    split_2_v: 0.35,

    save: function() { return { split_1_h: this.split_1_h, split_2_v: this.split_2_v } },
    load: function(v) { this.split_1_h = parseFloat(v.split_1_h) || 0.6; this.split_2_v = parseFloat(v.split_2_v) || 0.35}
}

function setup_horz_splitter(container, grip, resize1, resize2) //p1, , p2, c2)
{    
    var p1_height = Math.trunc(container.offsetHeight * main_view_state.split_2_v) - GRIP_WIDTH
    var resize = function() {
        resize1(null, p1_height)
        var p2_height = container.offsetHeight - p1_height - GRIP_WIDTH
        resize2(null, p2_height)
        recalc_canvases_rects()
    }
    resize()
    window.addEventListener('resize', resize);
 
    var moving = false;
    var lastY;
    
    grip.addEventListener('mousedown', function(e) {
        moving = true;
        lastY = e.pageY;
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });

    document.addEventListener('mousemove', function(e) {
      if (moving && e.pageY > MIN_PANEL_SIZE && e.pageY < container.offsetHeight - MIN_PANEL_SIZE) {
          p1_height += e.pageY - lastY
          lastY = e.pageY
          resize1(null, p1_height)
          var p2_height = container.offsetHeight - p1_height - GRIP_WIDTH
          resize2(null, p2_height)
          main_view_state.split_2_v = (p1_height + GRIP_WIDTH) / container.offsetHeight
          e.preventDefault(); // prevent selection action from messing it up
          recalc_canvases_rects()
      }
    });

}


function setup_vert_splitter(container, grip, resize1, resize2) //p1, c1, grip, p2, c2)
{
    var p1sz = Math.trunc(container.offsetWidth * main_view_state.split_1_h) - GRIP_WIDTH
    
    var resize = function() {
        resize1(p1sz, container.offsetHeight)

        var p2sz = container.offsetWidth - p1sz - GRIP_WIDTH
        resize2(p2sz, null)

        recalc_canvases_rects()
    }
    resize()
    window.addEventListener('resize', resize);

    var moving = false;
    var lastX;
    
    grip.addEventListener('mousedown', function(e) {
        moving = true;
        lastX = e.pageX;
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });

    document.addEventListener('mousemove', function(e) {
      if (moving && e.pageX > MIN_PANEL_SIZE && e.pageX < container.offsetWidth - MIN_PANEL_SIZE) {
          p1sz += e.pageX - lastX
          lastX = e.pageX
          resize1(p1sz, null)
          var p2sz = container.offsetWidth - p1sz - GRIP_WIDTH
          resize2(p2sz)
          main_view_state.split_1_h = (p1sz + GRIP_WIDTH) / container.offsetWidth
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

        this.last_ctx_menu = null
    }

    view_x(pageX) {
        return pageX - this.rect.left - this.pan_x
    }
    view_y(pageY) {
        return pageY - this.rect.top - this.pan_y
    }
    save() {
        return { pan_x:this.pan_x, pan_y:this.pan_y }
    }
    load(s) {
        this.pan_x = parseInt(s.pan_x); this.pan_y = parseInt(s.pan_y)
    }

    dismiss_ctx_menu() {
        if (this.last_ctx_menu != null) {
            main_view.removeChild(this.last_ctx_menu)
        this.last_ctx_menu = null
    }
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
        this.dismiss_popups = function() {}

        // viewport transform. don't use the canvas transform since we want stuff like vertex markers to remain the same size no matter what
        this.t_viewport = null
        this.t_inv_viewport = null  
        this.viewport_zoom = null // effective zoom of both the viewport transform and the mouse zoom
        // distance from the top or from the left of a the largest square that fits in the canvas. only one of these would be non-zero
        // used for centering the viewport
        this.margin_x = 0
        this.margin_y = 0
    }

    reset_view() {
        this.pan_x = 0
        this.pan_y = 0
        this.zoom = 1
        this.pan_redraw()
    }

    pan_redraw() {
        calc_img_viewport()
        trigger_frame_draw(true) // false)  needs to be true for texturs to redraw
    }
    resize_redraw() {
        this.pan_redraw()
    }
    click(x, y) {
        if (selected_node !== null)
            selected_node.cls.image_click(x, y)
    }
    find_obj(vx, vy, ex, ey) {
        if (selected_node !== null)
            return selected_node.cls.image_find_obj(vx, vy, ex, ey)
        return null
    }
    epnt_to_model(ex, ey) { // takes coord from mouse event
        let ti = vec2.create()
        vec2.transformMat3(ti, vec2.fromValues(ex,ey), this.t_inv_viewport)        
        return ti
    }
    unselect_all() {
        if (selected_node !== null)
            return selected_node.cls.clear_selection()        
    }

    context_menu(px, py, wx, wy) {
        let opt = []
        if (selected_node !== null) {
            let sel_obj_name = selected_node.cls.selected_obj_name()
            if (sel_obj_name !== null)
                opt.push({text:"Delete " + sel_obj_name, func:function() { selected_node.cls.delete_selection()} })
        }
        opt.push({text:"Reset view", func:function() { image_view.reset_view() }})
        
        this.last_ctx_menu = open_context_menu(opt, wx, wy, main_view, ()=>{ this.dismiss_ctx_menu() } )    
        return this.last_ctx_menu
    }
    
}

let image_view = null

function panel_mouse_control(view, canvas) 
{    
    var panning = false
    var prev_x, prev_y, down_x, down_y
    var hit = null
    var did_move = false  // used for detecting unselect
    
    canvas.addEventListener('mousedown', function(e) {
        if (e.buttons == 1) {
            prev_x = e.pageX; prev_y = e.pageY
            down_x = e.pageX; down_y = e.pageY
            let vx=view.view_x(e.pageX), vy=view.view_y(e.pageY)
            hit = view.find_obj(vx, vy, e.pageX, e.pageY);
            if (hit != null) {
                //console.log("hit ", hit)
                // passing e to potentiall stop propogation
                hit.mousedown(e, vx, vy) 
                return
            }
            did_move = false
            panning = true
        }
    });
    canvas.addEventListener('mouseup', function(e) {
        if (panning) { // means there was no hit
            var dx = Math.abs(e.pageX - down_x)
            var dy = Math.abs(e.pageY - down_y)
            if (dx + dy < 5) { // moved only a little
                if (view.click) {
                    // don't use view_x,view_y since the panning is already take into consideration in t_inv_viewport
                    view.click(e.pageX, e.pageY) 
                }
            }
        }
    });
    document.addEventListener('mouseup', function() {
        panning = false;
        if (hit !== null)
            hit.mouseup()  // commit line pending
        else if (!did_move)
            view.unselect_all(true) // click anywhere empty, without panning, just unselects the current selection (for nodes_view)
        hit = null
    });
    document.addEventListener('mousemove', function(e) {
        var dx = e.pageX - prev_x
        var dy = e.pageY - prev_y
        prev_x = e.pageX, prev_y = e.pageY
        if (dx == 0 && dy == 0) 
            return
        did_move = true
        if (panning) {
            view.pan_x += dx / view.zoom
            view.pan_y += dy / view.zoom
            view.pan_redraw()
        }
        else if (hit !== null) {
            let cvs_x = e.pageX - view.rect.left, cvs_y = e.pageY - view.rect.top
            hit.mousemove(dx, dy, view.view_x(e.pageX), view.view_y(e.pageY), e.pageX, e.pageY, cvs_x, cvs_y)
        }
    })
    
    canvas.addEventListener("contextmenu", function(e) {
        view.dismiss_ctx_menu()
        let cvs_x = e.pageX - view.rect.left, cvs_y = e.pageY - view.rect.top // relative to canvas
        let ctx = view.context_menu(view.view_x(e.pageX), view.view_y(e.pageY), e.pageX, e.pageY, cvs_x, cvs_y)
        if (ctx !== null)
            e.preventDefault()
        return false;
    })
    document.addEventListener('mousedown', function(e) {
        view.dismiss_ctx_menu()
        view.dismiss_popups()
    })


}

// https://github.com/jackmoore/wheelzoom/blob/master/wheelzoom.js
function panel_mouse_wheel(view, canvas)
{
    const zoom_factor = 1.10

    function onWarCanvasWheel(e) 
    {
        let bgPosX = view.pan_x * view.zoom
        let bgPosY = view.pan_y * view.zoom

        e.preventDefault();
        var deltaY = 0;
        if (e.deltaY) { // FireFox 17+ (IE9+, Chrome 31+?)
            deltaY = e.deltaY;
        } else if (e.wheelDelta) {
            deltaY = -e.wheelDelta;
        }

        var rect = canvas.getBoundingClientRect();
        var offsetX = e.pageX - rect.left - window.pageXOffset;
        var offsetY = e.pageY - rect.top - window.pageYOffset;
        // Record the offset between the bg edge and cursor:
        //  from corner to cursor
        var bgCursorX = offsetX - bgPosX;
        var bgCursorY = offsetY - bgPosY;
        // Use the previous offset to get the percent offset between the bg edge and cursor:
        var bgRatioX = bgCursorX/view.zoom;
        var bgRatioY = bgCursorY/view.zoom;
        // Update the bg size:
        if (deltaY < 0) {
            view.zoom *= zoom_factor;
        } else {
            view.zoom /= zoom_factor;
        }

        // Take the percent offset and apply it to the new size:
        //  from cursor back to corner
        bgPosX = offsetX - (view.zoom * bgRatioX);
        bgPosY = offsetY - (view.zoom * bgRatioY);

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
        if (opt.text == '-') 
            text += "<hr class='ctx_menu_sep'>"
        else
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
        input.addEventListener('input', ()=>{
            this.node.set_name(input.value)
            draw_nodes()
        })
        input.addEventListener("keypress", function(e) {
            if (e.keyCode == 13)
                nodes_dismiss_name_input()
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
            // if ctrl is pressed, do a full clear and run, otherwise do a normal run with caches
            trigger_frame_draw(true, e.ctrlKey)
        }
    })
}


function create_dialog(parent, title, resizable, rect, visible_changed)
{
    let dlg = add_div(parent, "dlg")
    if (!rect)
        rect = {left:null, top:null, width:null, height:null, visible:false}
    dlg.style.display = 'none'

    let title_line = add_div(dlg, "dlg_title")
    title_line.innerText = title
    let close_btn = add_div(title_line, "dlg_close_btn")
    close_btn.addEventListener('click', () => {
        rect.visible = false
        if (visible_changed)
            visible_changed(rect.visible)
        repos()
    })
    let set_visible = (v) => {
        rect.visible = v;
        repos()
    }
    let set_title = (v) => {
        title_line.innerText = v
    }

    let repos = () => {
        if (rect.left) {
            dlg.style.left = rect.left + "px"
            dlg.style.top =  rect.top + "px"
        }
        if (rect.width) {
            rect.width = Math.max(rect.width, 150)
            rect.height = Math.max(rect.height, 150)
            dlg.style.width = rect.width + "px"
            dlg.style.height = rect.height + "px"
        }
        dlg.style.display = rect.visible ? '' : 'none'
    }
    repos()

    if (resizable) {
        let r_resize = add_div(dlg, "dlg_resize_r")
        let l_resize = add_div(dlg, "dlg_resize_l")
        let b_resize = add_div(dlg, "dlg_resize_b")

        let rb_resize = add_div(dlg, "dlg_resize_rb")
        let lb_resize = add_div(dlg, "dlg_resize_lb")

        let move_func = (dx, dy) => {
            let curstyle = window.getComputedStyle(dlg)
            rect.left = parseInt(curstyle.left) + dx
            rect.top = parseInt(curstyle.top) + dy
            repos()
        }
        let resize_func =  (dx,dy) => {
            let curstyle = window.getComputedStyle(dlg)
            rect.width = parseInt(curstyle.width) + dx
            rect.height = parseInt(curstyle.height) + dy            
            repos()
        }
        add_move_handlers(title_line, move_func)
        add_move_handlers(rb_resize, resize_func)
        add_move_handlers(lb_resize, (dx, dy)=>{resize_func(-dx,dy); move_func(dx,0)})
        add_move_handlers(r_resize, (dx, dy)=>{resize_func(dx, 0)})
        add_move_handlers(l_resize, (dx, dy)=>{resize_func(-dx, 0); move_func(dx, 0)})
        add_move_handlers(b_resize, (dx, dy)=>{resize_func(0, dy)})
    }

    return {elem:dlg, rect:rect, set_visible:set_visible, set_title:set_title}
}

function add_move_handlers(grip, func) {
    var moving = false;
    var prevx, prevy;

    grip.addEventListener('mousedown', function(e) {
        moving = true;
        prevx = e.pageX; prevy = e.pageY
    });
    document.addEventListener('mousemove', function(e) {
        if (!moving) 
            return
        e.preventDefault(); // prevent selection action from messing it up
        let dx = e.pageX - prevx, dy = e.pageY - prevy
        if (dx == 0 && dy == 0)
            return
        func(dx, dy)
        prevx = e.pageX; prevy = e.pageY
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });
}

function save_as(parent) {
    let rect = {visible:true}
    let close_action = ()=> { parent.removeChild(dlg.elem)}
    let dlg = create_dialog(parent, "Save As...", false, rect, close_action)
    dlg.elem.classList.add('dlg_save_as')
    let label = add_div(dlg.elem, "dlg_label")
    label.innerText = "Select a name to save as:"
    let name_input = add_elem(dlg.elem, "input", "dlg_text_input")
    name_input.type = "text"
    name_input.spellcheck = false
    add_push_btn(dlg.elem, "Save", ()=> {
        let name = name_input.value
        if (name.length == 0) {
            console.error("Can't save with empty name")
            return
        }
        if (user_saved_programs[name]) {
            console.error("Name already exists " + name)
            return
        }
        user_saved_programs[name] = save_program_json()
        save_state()
        close_action()
    })
    add_push_btn(dlg.elem, "Cancel", close_action)
}

function create_top_menu(parent) {
    let menu_btn = add_div(parent, ['top_menu', 'top_menu_file'])
    menu_btn.innerText = "File"
    let cs = window.getComputedStyle(menu_btn)
    let open_menus = []
    function dismiss_menus() {
        for(let m of open_menus)
            parent.removeChild(m)
        open_menus.length = 0
    }
    menu_btn.addEventListener('click', ()=> {
        let opt = [{text:"Save As...", func:function() { save_as(parent) }}, {text:'-'}]
        for(let up_name in user_saved_programs) {
            let up = user_saved_programs[up_name]
            opt.push({text:up_name, func:function() { load_prog_json(up) }})
        }
        let menu = open_context_menu(opt, parseInt(cs.left), menu_btn.offsetHeight, parent, ()=>{ dismiss_menus() } )
        open_menus.push(menu)     
    })
}





