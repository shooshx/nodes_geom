"use strict";

const GRIP_WIDTH = 5
const MIN_PANEL_SIZE = 10



function recalc_canvases_rects() {
    nodes_view.rect = canvas_nodes.getBoundingClientRect();
    image_view.rect = canvas_image.getBoundingClientRect();
   // canvas_webgl.width = canvas_image.width  no reason to do that
   // canvas_webgl.height = canvas_image.height
}

var main_view_state = {
    split_1_h: 0.6,
    split_2_v: 0.35,

    save: function() { return { split_1_h: this.split_1_h, split_2_v: this.split_2_v } },
    load: function(v) { this.split_1_h = parseFloat(v.split_1_h) || 0.6; this.split_2_v = parseFloat(v.split_2_v) || 0.35}
}

function setup_horz_splitter(container, grip, resize1, resize2) //p1, , p2, c2)
{    
    let p1_height = Math.trunc(container.offsetHeight * main_view_state.split_2_v) - GRIP_WIDTH
    const resize = function() {
        resize1(null, p1_height)
        let p2_height = container.offsetHeight - p1_height - GRIP_WIDTH
        resize2(null, p2_height)
        recalc_canvases_rects()
    }
    resize()
    myAddEventListener(window, 'resize', resize);
 
    add_move_handlers(grip, (dx, dy, pageX, pageY)=>{
        if (pageY > MIN_PANEL_SIZE && pageY < container.offsetHeight - MIN_PANEL_SIZE) {
            p1_height += dy
            resize1(null, p1_height)
            let p2_height = container.offsetHeight - p1_height - GRIP_WIDTH
            resize2(null, p2_height)
            main_view_state.split_2_v = (p1_height + GRIP_WIDTH) / container.offsetHeight
            recalc_canvases_rects()
        }
    })

}


function setup_vert_splitter(container, grip, resize1, resize2) //p1, c1, grip, p2, c2)
{
    let p1sz = Math.trunc(container.offsetWidth * main_view_state.split_1_h) - GRIP_WIDTH
    
    const resize = function() {
        resize1(p1sz, container.offsetHeight, 0, 0)

        let p2sz = container.offsetWidth - p1sz - GRIP_WIDTH
        resize2(p2sz, null, 0, p1sz + GRIP_WIDTH)

        recalc_canvases_rects()
    }
    resize()
    myAddEventListener(window, 'resize', resize);

    add_move_handlers(grip, (dx, dy, pageX, pageY)=>{
        if (pageX > MIN_PANEL_SIZE && pageX < container.offsetWidth - MIN_PANEL_SIZE) {
            p1sz += dx
            resize1(p1sz, null, 0, 0)
            let p2sz = container.offsetWidth - p1sz - GRIP_WIDTH
            resize2(p2sz, null, 0, p1sz + GRIP_WIDTH)
            main_view_state.split_1_h = (p1sz + GRIP_WIDTH) / container.offsetWidth
            recalc_canvases_rects()
        }
    })
    
}

class ViewBase 
{
    constructor() {
        this.pan_x = null
        this.pan_y = null
        this.zoom = 1
        this.rect = null
        this.viewport_zoom = 1

        this.last_ctx_menu = null
    }

    view_x(pageX) {
        return (pageX - this.rect.left)/this.zoom - this.pan_x
    }
    view_y(pageY) {
        return (pageY - this.rect.top)/this.zoom - this.pan_y
    }
    save() {
        return { pan_x:this.pan_x, pan_y:this.pan_y, zoom:this.zoom }
    }
    load(s) {
        this.pan_x = (s.pan_x === undefined || s.pan_x === null) ? 0 : parseInt(s.pan_x)
        this.pan_y = (s.pan_y === undefined || s.pan_y === null) ? 0 : parseInt(s.pan_y)
        this.zoom =  (s.zoom === undefined  || s.zoom === null) ? 1 : parseFloat(s.zoom)
    }

    dismiss_ctx_menu() {
        if (this.last_ctx_menu != null) {
            main_view.removeChild(this.last_ctx_menu)
        }
        this.last_ctx_menu = null
    }

    nodes_inputevent(name, e) {
        return false
    }
    check_rect_select() {
        return false
    }

    reset_view() {
        this.pan_x = 0
        this.pan_y = 0
        this.zoom = 1
        this.pan_redraw()
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
        this.hover = nodes_hover
    }

    dismiss_popups() {
        nodes_dismiss_text_input()
        param_dismiss_popups()
        dismiss_top_menus()
    }
}

let nodes_view = null

class ImageView extends ViewBase
{
    constructor() {
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

    pan_redraw() {
        calc_img_viewport()
        trigger_frame_draw(false) // false since we don't want animation to advance when zooming and panning
    }
    resize_redraw() {
        this.pan_redraw()
    }
    click(x, y) {
        for(let sn of selected_nodes)
            sn.cls.image_click(x, y)
    }
    find_obj(e) {
        for(let sn of selected_nodes) {
            const hit = sn.cls.image_find_obj(e)
            if (hit !== null)
                return hit
        }
        return image_shadow_find_obj(e)
    }
    // check if any of the currently selected node supports multiple selection in the image view
    check_rect_select() {
        for(let sn of selected_nodes)
            if (sn.cls.rect_select !== undefined)
                return true
        return false
    }
    rect_select(min_x, min_y, max_x, max_y) {
        for(let sn of selected_nodes)
            if (sn.cls.rect_select !== undefined)
                sn.cls.rect_select(min_x, min_y, max_x, max_y)
    }
    epnt_to_model(ex, ey) { // takes coord from mouse event
        let ti = vec2.create()
        vec2.transformMat3(ti, vec2.fromValues(ex,ey), this.t_inv_viewport)        
        return ti
    }
    unselect_all() {
        for(let sn of selected_nodes)
            if (sn.cls.clear_selection !== undefined)
                sn.cls.clear_selection()        
    }

    context_menu(e) {
        let opt = []
        let obj_names = []
        for(let sn of selected_nodes)
            if (sn.cls.selected_obj_name !== undefined) {
                const name = sn.cls.selected_obj_name()
                if (name)
                    obj_names.push(name)
            }
        if (obj_names.length > 0) {
            opt.push({text:"Delete " + obj_names.join(", "), func:function() { 
                for(let sn of selected_nodes)
                    sn.cls.delete_selection()} 
            })
        }
        opt.push({text:"Reset view", func:function() { image_view.reset_view() }})
        
        this.last_ctx_menu = open_context_menu(opt, e.ex, e.ey, main_view, ()=>{ this.dismiss_ctx_menu() } )    
        return this.last_ctx_menu
    }


    nodes_inputevent(name, e) {
        let capture = false
        for(let node of program.input_nodes) {
            console.assert(node.cls.inputevent !== undefined, "Node does not declare inputevent func")
            if (node.cls.inputevent(name, e))
                capture = true
        }
        return capture
    }
    
}

function image_shadow_find_obj(e)
{
    if (e.cvs_x < 0 || e.cvs_y < 0 || e.cvs_x > canvas_image.width || e.cvs_y > canvas_image.height)
        return null

    const disp_obj = get_display_object()
    if (disp_obj === null || !disp_obj.can_draw_shadow())
        return null
    if (canvas_img_shadow.width !== canvas_image.width)
        canvas_img_shadow.width = canvas_image.width
    if (canvas_img_shadow.height != canvas_image.height)
        canvas_img_shadow.height = canvas_image.height
    
    disp_obj.draw_shadow(image_view.t_viewport)

    const shadow_col = ctx_img_shadow.getImageData(e.cvs_x, e.cvs_y, 1, 1).data
    const shadow_val = new Uint32Array(shadow_col.buffer)[0]
    const node_id = uid_from_color(shadow_val)
    if (node_id === null)
        return null
    const node = program.obj_map[node_id]
    if (node === undefined || node.constructor !== PNode)  // can happen due to antialiasing
        return null
    return node.cls.img_hit_find_obj()
}


function is_point_in_rect(x, y, rect) {
    return (x > rect.left && x < rect.right && y > rect.top && y < rect.bottom)
}

let image_view = null

function panel_mouse_control(view, canvas) 
{    
    let panning = false
    let prev_x, prev_y, down_x, down_y
    let hit = null
    let did_move = false  // used for detecting unselect
    let active_rect = null
    let node_capture = false
    
    myAddEventListener(canvas, 'mousedown', function(e) {
        if (e.target === canvas_image && view.nodes_inputevent('mousedown', {e:e, ex:e.pageX, ey: e.pageY, buttons:e.buttons})) {
            node_capture = true // variable-node mouse move
            return
        }
        if (e.buttons == 1) {
            if (e.ctrlKey && view.check_rect_select()) {
                active_rect = { x1:e.pageX, y1:e.pageY }
                return
            }
            prev_x = e.pageX; prev_y = e.pageY
            down_x = e.pageX; down_y = e.pageY
            const vx=view.view_x(e.pageX), vy=view.view_y(e.pageY)
            const cvs_x = e.pageX - view.rect.left, cvs_y = e.pageY - view.rect.top
            const ev = { vx:vx, vy:vy, ex:e.pageX, ey: e.pageY, cvs_x:cvs_x, cvs_y:cvs_y, e:e, ctrlKey:e.ctrlKey }
            hit = view.find_obj(ev);
            if (hit != null && hit.mousedown !== undefined) {
                //console.log("hit ", hit)
                // passing e to potentiall stop propogation
                hit.mousedown(ev)
                if (is_mousemovable(hit))
                    return  // if it can move, don't pan
            }
            did_move = false
            panning = true
            //console.log("down ", panning)
        }
    });
    myAddEventListener(canvas, 'mouseup', function(e) {
        if (panning) { // means there was no hit
            let dx = Math.abs(e.pageX - down_x)
            let dy = Math.abs(e.pageY - down_y)
            if (dx + dy < 5) { // moved only a little
                if (view.click) {
                    // don't use view_x,view_y since the panning is already take into consideration in t_inv_viewport
                    view.click(e.pageX, e.pageY) 
                }
            }
        }
    });
    myAddEventListener(document, 'mouseup', function(e) {
        panning = false;
        //console.log("up ", panning)
        if (hit !== null && hit.mouseup !== undefined)
            hit.mouseup()  // commit line pending
        else if (!did_move)
            view.unselect_all(true) // click anywhere empty, without panning, just unselects the current selection (for nodes_view)
        hit = null
        if (active_rect) {
            view.rect_select(undefined)
            active_rect = null
        }
        if (node_capture) {
            node_capture = false
            view.nodes_inputevent('mouseup', e)
        }
    });
    myAddEventListener(document, 'mousemove', function(e) {
        let dx = e.pageX - prev_x
        let dy = e.pageY - prev_y
        prev_x = e.pageX, prev_y = e.pageY
        if (dx == 0 && dy == 0) 
            return
        if (active_rect !== null) {
            let x2 = e.pageX, y2 = e.pageY
            view.rect_select(Math.min(active_rect.x1, x2), Math.min(active_rect.y1, y2),
                             Math.max(active_rect.x1, x2), Math.max(active_rect.y1, y2))
            return
        }
        did_move = true
        const edx = dx / view.viewport_zoom, edy = dy / view.viewport_zoom
        dx /= view.zoom
        dy /= view.zoom
        //console.log("move ", panning)
        if (panning) {
            view.pan_x += dx
            view.pan_y += dy
            view.pan_redraw()
        }
        else if (hit !== null && is_mousemovable(hit)) {
            let cvs_x = e.pageX - view.rect.left, cvs_y = e.pageY - view.rect.top
            const ev = {vx:view.view_x(e.pageX), vy:view.view_y(e.pageY), ex:e.pageX, ey:e.pageY, cvs_x:cvs_x, cvs_y:cvs_y,
                        shiftKey: e.shiftKey, ctrlKey:e.ctrlKey,
                        dx: edx, dy: edy}
            hit.mousemove(ev)
        }
        
        if (view.hover !== undefined) {
            let cvs_x = e.pageX - view.rect.left, cvs_y = e.pageY - view.rect.top // relative to canvas
            if (cvs_x >= 0 && cvs_y >= 0 && cvs_x < view.rect.width && cvs_y < view.rect.height) { // only if it's inside the canvas
                const ev = {vx:0, vy:0, ex:e.pageX, ey:e.pageY, cvs_x:cvs_x, cvs_y:cvs_y, buttons:e.buttons}
                view.hover(ev)
            }
        }

        if (node_capture || is_point_in_rect(e.pageX, e.pageY, view.rect) && e.target === canvas_image) {
            const ev = { ex:e.pageX, ey:e.pageY, dx:edx, dy:edy, img_canvas_capture: node_capture, buttons:e.buttons }
            view.nodes_inputevent('mousemove', ev)
        }
    })
    
    myAddEventListener(canvas, "contextmenu", function(e) {
        view.dismiss_ctx_menu()
        const cvs_x = e.pageX - view.rect.left, cvs_y = e.pageY - view.rect.top // relative to canvas
        const ev = { vx:view.view_x(e.pageX), vy:view.view_y(e.pageY), ex:e.pageX, ey:e.pageY, cvs_x:cvs_x, cvs_y:cvs_y }
        let ctx = view.context_menu(ev)
        if (ctx !== null)
            e.preventDefault()
        return false;
    })
    myAddEventListener(document, 'mousedown', function(e) {
        view.dismiss_ctx_menu()
        view.dismiss_popups()
    })

    myAddEventListener(document, 'mousewheel', function(e) { // don't keep boxes one while zooming
        view.dismiss_ctx_menu()
        view.dismiss_popups()
    })
}

function is_mousemovable(hit) {
    if (hit.mousemovable !== undefined)
        return hit.mousemovable()
    return hit.mousemove !== undefined
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
        let deltaY = 0;
        if (e.deltaY) { // FireFox 17+ (IE9+, Chrome 31+?)
            deltaY = e.deltaY;
        } else if (e.wheelDelta) {
            deltaY = -e.wheelDelta;
        }

        let rect = canvas.getBoundingClientRect();
        let offsetX = e.pageX - rect.left - window.pageXOffset;
        let offsetY = e.pageY - rect.top - window.pageYOffset;
        // Record the offset between the bg edge and cursor:
        //  from corner to cursor
        let bgCursorX = offsetX - bgPosX;
        let bgCursorY = offsetY - bgPosY;
        // Use the previous offset to get the percent offset between the bg edge and cursor:
        let bgRatioX = bgCursorX/view.zoom;
        let bgRatioY = bgCursorY/view.zoom;
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
    myAddEventListener(canvas, "wheel", onWarCanvasWheel)    
}


function addTextChild(elem, txt) {
    let dummy = document.createElement("DIV")
    dummy.innerHTML = txt
    let ne = dummy.firstChild
    elem.appendChild(ne)
    return ne
}



function open_context_menu(options, wx, wy, parent_elem, dismiss_func, sub_menu_of=null)
{
    let menu_elem = add_div(parent_elem, "ctx_menu")
    let open_sub = {opt:null, elem:null}
    for(let opt of options) {
        let e = null
        if (opt.cmake_elems)
            e = opt.cmake_elems(menu_elem)
        else if (opt.text == '-') 
            e = add_elem(menu_elem, 'HR', "ctx_menu_sep")
        else if (opt.type === "file-in") {
            const [fin,btn] = add_upload_btn(menu_elem, 'ctx_menu_opt', opt.text, opt.func)
            e = fin
        }
        else {
            e = add_div(menu_elem, 'ctx_menu_opt')
            e.innerText = opt.text
            if (opt.cls !== undefined)
                e.classList.add(opt.cls)
        }
        
        if (e === undefined || e === null)
            continue
        if (opt.sub_opts !== undefined) {
            e.classList.toggle('ctx_menu_sub')
            myAddEventListener(e, 'mousemove', function() {
                if (open_sub.opt === opt)
                    return // this is already open
                if (open_sub.elem !== null)
                    open_sub.elem.parentElement.removeChild(open_sub.elem)
                open_sub.opt = opt
                const rect = e.getBoundingClientRect();
                open_sub.elem = open_context_menu(opt.sub_opts, Math.trunc(rect.right)-wx-4, Math.trunc(rect.top)-wy-3, menu_elem, dismiss_func, menu_elem)
            })
        }
        else { // normal option, dismiss open sub if exists
            myAddEventListener(e, 'mousemove', function() {
                if (open_sub.elem !== null)
                    open_sub.elem.parentElement.removeChild(open_sub.elem)
                open_sub.elem = null; open_sub.opt = null
            })
        }
        stop_propogation_on("mousedown", e)
        if (opt.func === undefined)
            continue
        myAddEventListener(e, 'click', function() {
            if (opt.type !== "file-in")
                opt.func()
            dismiss_func()
        })        

    }

    stop_propogation_on("mousedown", menu_elem) // stop it from dismissing on click due to other handlers in the document

    let main_width = main_view.offsetWidth, main_height = main_view.offsetHeight
    let menu_width = menu_elem.offsetWidth, menu_height = menu_elem.offsetHeight
    const parentRect = parent_elem.getBoundingClientRect()
    let rx = Math.trunc(parentRect.left) + wx, ry = Math.trunc(parentRect.top) + wy
    
    if (rx + menu_width > main_width) {  // x overflow
        if (sub_menu_of === null)
            rx = main_width - menu_width
        else // show on the other side of the parent menu
            rx = sub_menu_of.getBoundingClientRect().left - menu_width + 3 // a little overlap
    }
    if (ry + menu_height > main_height) { // y overflow
        ry = main_height - menu_height
    }
    wx = rx - parentRect.left // needs to be relative to parent
    wy = ry - parentRect.top
    
    menu_elem.style.left = wx + "px"
    menu_elem.style.top = wy + "px"
    return menu_elem
}

var last_name_input_elem = null
function nodes_dismiss_text_input() {
    if (last_name_input_elem != null) {
        main_view.removeChild(last_name_input_elem)
        last_name_input_elem = null
    }
}
function pop_nodes_text_input(x, y, startv, func, opt) {
    // TBD a better way to do it is to hide the text area altogether instead oftrying to align it to the canvas text
    nodes_dismiss_text_input()
    const multi = opt && opt.multiline
    const elem = add_div(main_view, "node_name_edit")
    let input, yoffset = 0
    if (!multi) {
        input = add_elem(elem, "input", "node_name_input")
        input.setAttribute("type", "text")
        yoffset = 5
    }
    else {
        input = add_elem(elem, "textarea", ["node_name_input", "node_text_area"])
        yoffset = (opt.yoffset !== undefined) ? opt.yoffset : 6  // depends on font size
    }
    if (nodes_view.zoom !== 1.0) {
        // make the scale move the box to the right and not to both ways
        input.style.transform = "translate(-50%,-50%) scale(" + nodes_view.zoom + ") translate(50%,50%)"
    }
    yoffset *= nodes_view.zoom
    input.setAttribute("spellcheck", false)
    const move_to = (to_x, to_y)=>{
        elem.style.left = ((to_x + nodes_view.pan_x)*nodes_view.zoom + nodes_view.rect.left) + "px"
        elem.style.top = ((to_y + nodes_view.pan_y)*nodes_view.zoom + nodes_view.rect.top - yoffset) + "px"
    }
    move_to(x, y)
    input.value = startv
    stop_propogation_on("mousedown", input)
    myAddEventListener(input, 'input', ()=>{
        func(input.value)
        draw_nodes()
    })
    if (!multi) {
        myAddEventListener(input, "keypress", function(e) {
            if (e.keyCode == 13)
                nodes_dismiss_text_input()
        })
    }
    last_name_input_elem = elem

    return {elem:elem, input:input, move_to:move_to}
}

class NameInput
{
    constructor(node, parent_elem) {
        this.node = node
        this.elem = null
    }
    mousedown(ev) {
        ev.e.stopPropagation() // don't want it to dismiss the NameInput we just opened
        pop_nodes_text_input(this.node.namex(), this.node.namey(), this.node.name, (v)=>{
            this.node.set_name(v)
        });
    }
    mouseup() {
    }
    mousemove() {
    }
}



function setup_key_bindings()
{
    myAddEventListener(document, "keypress", function(e) {
        if (e.key == ' ') {
            // if ctrl is pressed, do a full clear and run, otherwise do a normal run with caches
            // ctrl+space stopped working?
            trigger_frame_draw(true, e.ctrlKey || e.shiftKey) 
        }
    })
}


function create_dialog(parent, title, resizable, rect, visible_changed, size_changed=null)
{
    const dlg = add_div(parent, "dlg")
    if (!rect)
        rect = {left:null, top:null, width:null, height:null, visible:false}
    dlg.style.display = 'none'

    const title_line = add_div(dlg, "dlg_title")
    const title_text = add_elem(title_line, 'span', 'dlg_title_text')
    title_text.innerText = title
    const close_btn = add_div(title_line, "dlg_close_btn")

    const set_visible = (v) => {
        if (v == rect.visible)
            return
        rect.visible = v;
        if (visible_changed)
            visible_changed(rect.visible)
        repos()
    }
    myAddEventListener(close_btn, 'click', () => {
        set_visible(false)
    })
    const client = add_div(dlg, "dlg_client")


    const set_title = (v) => {
        title_text.innerText = v
    }

    const repos = () => {
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

    const move_coord_limited = (rect, curstyle, name, d, max_v, min_v) => {
        if (rect[name] === null || rect[name] === undefined || isNaN(rect[name]))
            rect[name] = parseInt(curstyle[name])
        const track_name = "track_" + name
        if (rect[track_name] === null || rect[track_name] === undefined || isNaN(rect[track_name]))
            rect[track_name] = rect[name]
        rect[track_name] = rect[track_name] + d  // tracking the mouse even if it goes negative
        rect[name] = Math.min(Math.max(rect[track_name], min_v), max_v)
    }

    const move_func = (dx, dy) => {
        const curstyle = window.getComputedStyle(dlg)
        move_coord_limited(rect, curstyle, "left", dx, window.innerWidth - 40, 0)       
        move_coord_limited(rect, curstyle, "top", dy, window.innerHeight - 40, 0)
        repos()
    }
    const start_move_func = ()=>{
        rect.track_top = null
        rect.track_left = null
        rect.track_width = null
        rect.track_height = null
    }
    add_move_handlers(title_line, move_func, start_move_func)


    if (resizable) {
        let r_resize = add_div(dlg, "dlg_resize_r")
        let l_resize = add_div(dlg, "dlg_resize_l")
        let b_resize = add_div(dlg, "dlg_resize_b")

        let rb_resize = add_div(dlg, "dlg_resize_rb")
        let lb_resize = add_div(dlg, "dlg_resize_lb")

        let resize_func =  (dx,dy) => {
            let curstyle = window.getComputedStyle(dlg)
            move_coord_limited(rect, curstyle, "width", dx, window.innerWidth - 40, 150)
            move_coord_limited(rect, curstyle, "height", dy, window.innerWidth - 40, 150)       
            repos()
            if (size_changed !== null)
                size_changed()            
        }
        add_move_handlers(rb_resize, resize_func)
        add_move_handlers(lb_resize, (dx, dy)=>{resize_func(-dx,dy); move_func(dx,0)})
        add_move_handlers(r_resize, (dx, dy)=>{resize_func(dx, 0)})
        add_move_handlers(l_resize, (dx, dy)=>{resize_func(-dx, 0); move_func(dx, 0)})
        add_move_handlers(b_resize, (dx, dy)=>{resize_func(0, dy)})
        if (size_changed !== null)
            size_changed()        
    }

    return {elem:dlg, client:client, rect:rect, dset_visible:set_visible, set_title:set_title}
}

// generic function to handle all cases of dragging some UI element
function add_move_handlers(grip, movefunc, downfunc=null) {
    let moving = false;
    let prevx, prevy;

    const moveHandler = function(e) {
        if (!moving) 
            return
        e.preventDefault(); // prevent selection action from messing it up
        let dx = e.pageX - prevx, dy = e.pageY - prevy
        if (dx == 0 && dy == 0)
            return
        movefunc(dx, dy, e.pageX, e.pageY)
        prevx = e.pageX; prevy = e.pageY
    }
    const ev = {move:null, up:null}
    const upHandler = function() {
        moving = false;
        document.removeEventListener('mousemove', ev.move)
        document.removeEventListener('mouseup', ev.up)
        ev.move = null
        ev.up = null
    }
    myAddEventListener(grip, 'mousedown', function(e) {
        if (e.buttons != 1)
            return
        moving = true;
        if (downfunc)
            downfunc(e.pageX, e.pageY, e)
        prevx = e.pageX; prevy = e.pageY
        ev.move = myAddEventListener(document, 'mousemove', moveHandler);
        ev.up = myAddEventListener(document, 'mouseup', upHandler);
    });
}

// an input dialog with input fields
function fields_input_dlg(parent, caption, text, on_save_func)
{
    let rect = {visible:true}
    let close_action = ()=> { parent.removeChild(dlg.elem)}
    let dlg = create_dialog(parent, caption, false, rect, close_action)
    dlg.elem.classList.add("dlg_size_save_as")
    let label = add_div(dlg.client, "dlg_label")
    label.innerText = text
    const center_elem = add_div(dlg.client)

    let buttons = add_div(dlg.client, "dlg_buttons_group")
    const sb = add_push_btn(buttons, "Save", ()=>{ on_save_func(); close_action(); })
    sb.classList.add("dlg_button")
    const cb = add_push_btn(buttons, "Cancel", close_action)    
    cb.classList.add("dlg_button")
    return {dlg:dlg, center_elem:center_elem}
}

function input_dlg(parent, caption, text, on_save_func) 
{
    let name_input = null
    let [dlg, center_elem] = fields_input_dlg(parent, caption, text, ()=>{on_save_func(name_input.value)})
    name_input = add_elem(center_elem, "input", "dlg_text_input")
    name_input.type = "text"
    name_input.spellcheck = false
}

function message_box(title, text, opts) 
{
    const rect = {visible:true}
    const close_action = ()=> { main_view.removeChild(dlg.elem)}
    const dlg = create_dialog(main_view, title, false, rect, close_action)
    const label = add_div(dlg.client, "dlg_label")
    label.innerText = text
    
    const buttons = add_div(dlg.client, "dlg_buttons_group")
    for(let opt of opts) {
        const sb = add_push_btn(buttons, opt.text, ()=>{ 
            if (opt.func)
                opt.func()
            close_action();
        })
        sb.classList.add("dlg_button")
    }
    return dlg
}

function save_as(parent) {
    input_dlg(parent, "Save As...", "Select a name to save as:", (name)=>{
        if (name.length == 0) {
            console.error("Can't save with empty name")
            return
        }
        if (user_saved_programs[name]) {
            console.error("Name already exists " + name)
            return
        }
        user_saved_programs[name] = save_program_json()
        save_saved_progs()
    })
}


var downloadLink = null

function saveFile(name, type, data) {
    if (downloadLink === null) {
        downloadLink = document.createElement('a');
        downloadLink.style.display = 'none'
        main_view.appendChild(downloadLink)
    }
    var url = window.URL.createObjectURL(new Blob([data], {type: type}));
    downloadLink.setAttribute("href", url);
    downloadLink.setAttribute("download", name);
    downloadLink.click();
    window.URL.revokeObjectURL(url);
}

function export_entire_state(parent) {
    const json = make_state(true)
    saveFile("entire_state.json", "application/json", json)
}

function export_prog() {
    const obj = save_program()
    const text = jsyaml.safeDump(obj, {noCompatMode:true, lineWidth:-1, _flowArrLevel:3}) // don't want lines to be flow (single line)
    saveFile("program.yaml", "application/x-yaml", text)
}

function import_prog(file) {
    console.log("import!", file)
    let reader = new FileReader();
    myAddEventListener(reader, "load", function(e) {
        try {
            const obj = jsyaml.safeLoad(e.target.result)
            load_prog_obj(obj)
        }
        catch(e) {
            console.error(e)
            return
        }
    })
    myAddEventListener(reader, "error", function(e) {
        console.error(e)
    })
    reader.readAsText(file)
}

function export_png() {
    let dl_lnk = null
    const on_save = ()=>{
        const make_file = ()=>{
            dl_lnk.download = "image.png"
            dl_lnk.href = canvas_image.toDataURL('image/png')
            dl_lnk.click()            
        }
        if (width_input.value != canvas_image.width || height_input.value != canvas_image.height) {
            const rel_pan_x = image_view.pan_x / image_view.viewport_zoom
            const rel_pan_y = image_view.pan_y / image_view.viewport_zoom
            canvas_image.width = width_input.value
            canvas_image.height = height_input.value
            calc_img_viewport()
            image_view.pan_x = rel_pan_x * image_view.viewport_zoom
            image_view.pan_y = rel_pan_y * image_view.viewport_zoom
            //image_view.resize_redraw()
            call_frame_draw(false, false, ()=>{
                make_file()
            })
        }
        else {
            make_file()
        }

    }
    const ratio = canvas_image.width / canvas_image.height
    const d = fields_input_dlg(main_view, "Export PNG", "Image size:", on_save)

    const width_div = add_div(d.center_elem, "dlg_input_line")
    add_elem(width_div, "span", "dlg_input_label").innerText = "Width:"
    const width_input = add_elem(width_div, "input", "dlg_text_input")
    width_input.type = "number"
    width_input.addEventListener('input', ()=>{
        height_input.value = Math.round(width_input.value / ratio)
    })

    const height_div = add_div(d.center_elem, "dlg_input_line")    
    add_elem(height_div, "span", "dlg_input_label").innerText = "Height:"
    const height_input = add_elem(height_div, "input", "dlg_text_input")
    height_input.type = "number"
    height_input.addEventListener('input', ()=>{
        width_input.value = Math.round(height_input.value * ratio)
    })
    dl_lnk = add_elem(d.center_elem, "a", "dl_lnk_hidden")
    width_input.value = canvas_image.width
    height_input.value = canvas_image.height
}


function export_svg()
{
    if (program.display_node === null) {
        message_box("Error", "No display node selected", {text:"OK"})
        return
    }
    const disp_obj = program.display_node.outputs[0].get_const()
    if (disp_obj === null) {
        message_box("Error", "No output object generated", {text:"OK"})
        return
    }
    const backup = ctx_img
    const ctx_svg = new C2S(canvas_image.width, canvas_image.height);
    ctx_svg.need_antialias_gap_fill = false
    ctx_img = ctx_svg
    try {
        if (disp_obj.invalidate_pos !== undefined)
            disp_obj.invalidate_pos() // force paths to be recreated
        canvas_transform(ctx_svg, image_view.t_viewport)
        disp_obj.draw_m(image_view.t_viewport, program.display_node.display_values)
    }
    catch(e) {
        message_box("Error", e.message, [{text:"OK"}])
        return
    }
    finally {
        if (disp_obj.invalidate_pos !== undefined)
            disp_obj.invalidate_pos() // force paths to be recreated
        ctx_img = backup
    }
    const text = ctx_svg.getSerializedSvg(true)
    const dl_lnk = add_elem(main_view, "a", "dl_lnk_hidden")
    saveFile("image.svg", "image/svg+xml", text)
}



var open_top_menus = []


function create_top_menu(parent) {
    let menu_btn = add_div(parent, ['top_menu', 'top_menu_file'])
    menu_btn.innerText = "File"
    let cs = window.getComputedStyle(menu_btn)

    myAddEventListener(menu_btn, 'click', ()=> {
        let opt = [//{text:"Save As...", func:function() { save_as(parent) }},
                   {text:"Export Program...", func:export_prog },
                   {text:"Import Program...", func:import_prog, type:"file-in" },
                   {text:"Export PNG...", func:export_png },
                   {text:"Export SVG...", func:export_svg }
                   //{text:"Export State...", func: ()=>{ export_entire_state(parent) }},
                   //{text:"Export SVG...", func: ()=>{ export_svg(parent) }},
                   //{text:'-'}
                   ]
       /* for(let up_name in user_saved_programs) {
            let up = user_saved_programs[up_name]
            opt.push({text:up_name, func:function() { load_prog_json(up) }})
        }*/
        let menu = open_context_menu(opt, parseInt(cs.left), menu_btn.offsetHeight, parent, ()=>{ dismiss_top_menus() } )
        open_top_menus.push(menu)     
    })
}

function dismiss_top_menus() {
    for(let m of open_top_menus)
        m.parentElement.removeChild(m)
    open_top_menus.length = 0
}


var fps_disp = null

function create_anim_bar()
{
    main_view.style.bottom = "35px"
    const anim_bar = add_div(body, "anim_bar")
    const back_btn = add_div(anim_bar, ["anim_btn", "anim_back_btn"])
    myAddEventListener(back_btn, "click", function() {
         g_anim.rewind()
    })

    const play_in = add_elem(anim_bar, 'input', 'param_checkbox_input')
    play_in.type = 'checkbox'
    play_in.id = 'play_btn_check'
    const play_btn = add_elem(anim_bar, 'label', ["anim_btn", 'anim_play_btn'])
    play_btn.setAttribute("for", play_in.id)
    
    myAddEventListener(play_in, 'change', function() { 
        if (play_in.checked)
            g_anim.start()
        else
            g_anim.pause()
    })

    const one_next = add_div(anim_bar, ["anim_btn", "anim_one_next_btn"])
    myAddEventListener(one_next, "click", function() {
         g_anim.one_next()
    })

    const frame_disp_wrap = add_div(anim_bar, 'anim_frame_disp_wrap') // needed for the tooltip
    const frame_disp = add_elem(frame_disp_wrap, 'input', "anim_frame_disp")
    frame_disp.type = 'text'
    frame_disp.spellcheck = false
    frame_disp.value = "0"

    myAddEventListener(frame_disp, 'input', function() {
        const num = parseInt(frame_disp.value)
        g_anim.set_frame_num(num - 1) // setting it to -1 so that next time we run we run the frame requested
    })

    const edit_hover = add_div(frame_disp_wrap, ["hover_box", "anim_fn_hover_box"])
    edit_hover.innerText = "frame_num"

    fps_disp = add_div(anim_bar, 'anim_fps_disp')
    fps_disp.innerText = "0"

    g_anim.reg_pre_draw( (frame_num, frame_time, running)=>{
        frame_disp.value = frame_num
        if (!running)
            play_in.checked = false
    })
}

let frame_count = 0  // since last print    
let last_update_time = 0

function fps_counter_update()
{
    const frame_time = performance.now()
    const dt = frame_time - last_update_time 
    if (dt > 500) {
        const fps = frame_count / (dt / 1000)
        fps_disp.innerText = fps.toFixed(1) + " fps"
        last_update_time = frame_time
        frame_count = 0
        //console.log("erm ", last_update_time, " ", frame_count)
    }
    ++frame_count
}

