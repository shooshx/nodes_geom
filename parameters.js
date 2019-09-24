
class Parameter
{
    constructor(node, label) {
        this.label = label
        this.label_elem = null  // use for changing the label 
        this.line_elem = null  // used for enable
        this.enable = true
        node.parameters.push(this)
        this.owner = node
        this.dirty = true  // was it changed since the last run?
    }
    set_label(text) {
        this.label = text
        if (this.label_elem !== null) // can be null if we call this before displaying elements
            this.label_elem.innerText = text
    }
    set_enable(v) {
        this.enable = v
        if (this.line_elem !== null)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
    init_enable() {
        if (this.line_elem !== null && !this.enable)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
}

// if the text of one of the labels is too long, fix the length of all of them
function fix_label_lengths(parameters) {
    let max_width = 0
    for(let p of parameters) {
        if (p.label_elem && p.label_elem.scrollWidth > p.label_elem.offsetWidth) {
            max_width = Math.max(max_width, p.label_elem.scrollWidth + 5)
        }
    }
    if (max_width != 0) {
        for(let p of parameters) {
            p.label_elem.style.width = max_width + "px"
        }
    }
}

function show_params_of(node) {
    // clear children
    let div_params_list = document.getElementById('div_params_list')
    var cNode = div_params_list.cloneNode(false);
    div_params_list.parentNode.replaceChild(cNode, div_params_list);
    div_params_list = cNode
    if (node === null)
        return
    
    for(let p of node.parameters) {
        p.add_elems(div_params_list)
        p.init_enable()
    }
    fix_label_lengths(node.parameters)
}

function create_elem(elem_type, clss) {
    let e = document.createElement(elem_type);
    if (clss !== undefined)
        e.classList = clss.join(" ")
    return e
}
function add_elem(parent, elem_type, cls) {
    let e = create_elem(elem_type, [cls])
    parent.appendChild(e)
    return e
}
function create_div(clss) {
    let e = document.createElement("div");
    if (clss !== undefined)
        e.classList = clss.join(" ")
    return e
}

function add_div(parent, cls) {
    if (!Array.isArray(cls))
        cls = [cls]
    let e = create_div(cls)
    parent.appendChild(e)
    return e
}
function add_param_line(parent) { return add_div(parent, 'param_line') }
function add_param_block(parent) { return add_div(parent, 'param_block') } // for multi-line params

function add_param_label(line, text) {
    let e = document.createElement('span')
    if (text != null) {
        e.innerText = text
        e.className = 'param_label_pre'
    }
    else
        e.className = 'param_label_pre_empty'

    line.appendChild(e)
    if (text != null) {
        let colon = document.createElement('span')
        colon.className = 'param_label_colon'    
        colon.innerText = ':'  // can't just concatenate this above since the label may change
        line.append(colon)
    }
    return e
}
function add_param_edit(line, value, set_func) {
    let e = document.createElement('input')
    e.className = 'param_input'
    e.type = 'text'
    e.spellcheck = 'false'
    e.value = value
    // TBD parse error
    e.addEventListener("input", function() { set_func(e.value); trigger_frame_draw(true) })
    line.appendChild(e)
    return e
}
function add_param_color(line, value, cls, set_func) {
    let e = document.createElement('input')
    e.className = cls
    line.appendChild(e) // must have parent
    // TBD move setting the func to be the last thing to avoid spurious triggers
    let ce = ColorEditBox.create_at(e, 200, function(c) { if (set_func(c)) trigger_frame_draw(true) }, {with_alpha:true})
    ce.set_color(value, true)
    return [ce.get_color().copy(), e]
}
let checkbox_ids = 1
function add_param_checkbox(line, label, value, set_func) {
    let ein = add_elem(line, 'input', 'param_checkbox_input')
    ein.type = 'checkbox'
    ein.id = 'p_chb_' + checkbox_ids++
    ein.checked = value
    ein.addEventListener('change', function() { set_func(ein.checked); trigger_frame_draw(true)})
    let edisp = add_elem(line, 'label', 'param_checkbox_disp')
    edisp.setAttribute("for", ein.id)
    let etext = add_elem(line, 'label', 'param_checkbox_text')
    etext.setAttribute("for", ein.id)
    etext.innerText = label
    return etext
}
function add_push_btn(parent, label, onclick) {
    let btn = add_div(parent, "param_btn")
    btn.innerText = label
    btn.addEventListener("click", onclick)
    return btn
}
function add_checkbox_btn(parent, label, value, onchange) {
    let ein = add_elem(parent, 'input', 'param_checkbox_input')
    ein.type = 'checkbox'
    ein.id = 'p_chb_' + checkbox_ids++
    ein.checked = value
    ein.addEventListener('change', function() { onchange(ein.checked); })
    let btn = add_elem(parent, 'label', 'param_btn')
    btn.setAttribute("for", ein.id)
    btn.innerText = label
    return [ein, btn]
}


class ParamInt extends Parameter {
    constructor(node, label, start_v) {
        super(node, label)
        this.v = start_v
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let that = this
        add_param_edit(this.line_elem, this.v, function(v) { that.v = parseInt(v); this.dirty = true }) // TBD enforce int with parsing
    }
}

class ParamFloat extends Parameter {
    constructor(node, label, start_v) {
        super(node, label)
        this.v = start_v
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let that = this
        add_param_edit(this.line_elem, this.v, function(v) { that.v = parseFloat(v); this.dirty = true }) // TBD enforce int with parsing
    }
}

class ParamBool extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
    }
    save() { return {v:this.v} }
    load(v) { this.v = v.v; this.change_func(v)  }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        add_param_label(this.line_elem, null)  // empty space
        this.label_elem = add_param_checkbox(this.line_elem, this.label, this.v, (v) => { 
            that.v = v; 
            this.dirty = true
            if (that.change_func) 
                that.change_func(v) 
        })
    }
}

class ParamVec2 extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
    }
    save() { return {x:this.x, y:this.y} }
    load(v) { this.x=v.x; this.y=v.y }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.x, (v) => { this.x = parseFloat(v); this.dirty = true })
        add_param_edit(this.line_elem, this.y, (v) => { this.y = parseFloat(v); this.dirty = true })
    }
}

class ParamColor extends Parameter {
    constructor(node, label, start_c_str) {
        super(node, label)
        this.v = ColorPicker.parse_hex(start_c_str)
    }
    save() { return (this.v !== null) ? this.v.hex : null }
    load(v) { this.v = ColorPicker.parse_hex(v) }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let that = this
        [this.v, elem] = add_param_color(this.line_elem, this.v, 'param_input', function(v) { 
            if (that.v !== null && that.v.hex == v.hex) 
                return false;
            if (v === null)
                that.v = null
            else
                that.v = v.copy() // make a copy so that this.v will be different object than the internal object
            this.dirty = true
            return true
        })
    }
}

class ParamTransform extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.translate = vec2.fromValues(0,0)
        this.rotate = 0
        this.scale = vec2.fromValues(1,1)
        this.v = mat3.create()
    }
    save() { return {t:this.translate, r:this.rotate, s:this.scale} }
    load(v) { this.translate[0] = v.t[0]; this.translate[1] = v.t[1]; this.rotate = v.r; this.scale[0] = v.s[0]; this.scale[1] = v.s[1]; this.calc_mat() }
    calc_mat() {
        mat3.identity(this.v)
        mat3.scale(this.v, this.v, this.scale)
        mat3.rotate(this.v, this.v, glm.toRadian(this.rotate))
        mat3.translate(this.v, this.v, this.translate)
        this.dirty = true
    }
    add_elems(parent) {  // TBD support enable
        let that = this
        let line1 = add_param_line(parent)
        add_param_label(line1, "Translate")
        add_param_edit(line1, this.translate[0], function(v) { that.translate[0] = v; that.calc_mat() })
        add_param_edit(line1, this.translate[1], function(v) { that.translate[1] = v; that.calc_mat()})
        let line2 = add_param_line(parent)
        add_param_label(line2, "Rotate")
        add_param_edit(line2, this.rotate, function(v) { that.rotate = v; that.calc_mat()})
        let line3 = add_param_line(parent)
        add_param_label(line3, "Scale")
        add_param_edit(line3, this.scale[0], function(v) { that.scale[0] = v; that.calc_mat()})
        add_param_edit(line3, this.scale[1], function(v) { that.scale[1] = v; that.calc_mat()})
    }
}

function cull_list(lst) {
    let newlst = new lst.constructor()
    for(let v of lst) 
        if (v !== undefined)
            newlst.push(v) // don't want a list with holes    
    return newlst
}

class ListParam extends Parameter {
    constructor(node, label, values_per_entry, in_table, lst_type, elem_prm) {
        super(node, label)
        this.elem_prm = elem_prm
        this.values_per_entry = values_per_entry
        this.lst_type = lst_type
        this.lst = new lst_type()  // flat list
        this.elem_lst = []
        this.table = in_table
        this.column = in_table.register(this)  // columns are vertical, rows are horizontal
    }
    add_elems(parent) {}
    save() { return {lst:this.lst} }
    load(v) { this.lst = new this.lst_type(v.lst) }

    add(v) { // for multiple lists in a table, needs to be called in the right order of the columns
        let av = v
        if (v.length === undefined)  // support single value and list of values for vec
            av = [v]
        console.assert(av.length == this.values_per_entry, "Unexpected number of values")
        let newlst = new this.lst_type(this.lst.length + av.length)
        newlst.set(this.lst)
        newlst.set(av, this.lst.length)
        this.lst = newlst
        this.dirty = true

        let vindex = (this.lst.length - this.values_per_entry)
        this.create_entry_elems(v, this.table.get_column_elem(this.column), vindex)
    }
    add_column_elems(column_elem) {
        this.elem_lst = []
        for(let vindex = 0; vindex < this.lst.length; vindex += this.values_per_entry) {
            let v = []
            if (this.values_per_entry > 1)
                for(let vi = 0; vi < this.values_per_entry; ++vi)
                    v[vi] = this.lst[vindex + vi]            
            else
                v = this.lst[vindex]
            let e = this.create_entry_elems(v, column_elem, vindex)
        }
    }

    create_entry_elems(v, parent, vindex) {
        let e
        if (this.elem_prm.create_elem !== undefined) {
            e = this.elem_prm.create_elem(parent, v, (v) => {
                console.assert(v.length == this.values_per_entry, "unexpected length of value")
                for(let vi = 0; vi < this.values_per_entry; ++vi)
                    this.lst[vindex + vi] = v[vi]
                trigger_frame_draw(true)
            })
        }
        else {
            e = create_div([this.elem_prm.cls])
            e.innerText = this.elem_prm.to_string(v)
            parent.appendChild(e)
        }
        this.elem_lst.push(e)
        return e
    }    

    remove(index_lst) { // need to remove a list since the indices will change if we remove one by one
        for(let index of index_lst) {
            let vindex = index * this.values_per_entry
            console.assert(vindex < this.lst.length, "remove out of range")
            for(let i = 0; i < this.values_per_entry; ++i)
                delete this.lst[vindex+i]
            this.elem_lst[index].remove() // remove from DOM tree
            delete this.elem_lst[index]  // make it undefined for later cull
        }
        this.lst = cull_list(this.lst)
        this.dirty = true
        this.elem_lst = cull_list(this.elem_lst)
        console.assert(this.lst.length == this.elem_lst.length * this.values_per_entry, "unexpected number of elements")
    }

    reprint_line(vidx, v) {
        this.elem_lst[vidx / this.values_per_entry].innerText = this.elem_prm.to_string(v)
    }

    modify(index, v) { // index is already multiplied by values_per_entry
        console.assert(v.length == this.values_per_entry, "Unexpected number of values")
        let vindex = index * this.values_per_entry
        console.assert(vindex < this.lst.length, "modify out of range")
        for(let vi = 0; vi < v.length; ++vi)
            this.lst[vindex + vi] = v[vi]
        this.dirty = true
        this.reprint_line(vindex, v)
    }
    increment(index, v) {
        console.assert(v.length == this.values_per_entry, "Unexpected number of values")
        let vindex = index * this.values_per_entry
        console.assert(vindex < this.lst.length, "modify out of range")
        for(let vi = 0; vi < v.length; ++vi) {
            this.lst[vindex + vi] += v[vi]
        }
        this.dirty = true
        this.reprint_line(vindex, this.lst.slice(vindex, vindex + this.values_per_entry))
    }    
}

class TableParam extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.list_params = []  // registered ListParams
        //this.elem_rows = []  // entire row div
        this.elem_cols = []
    }
    register(list_param) {
        this.list_params.push(list_param)
        return this.list_params.length - 1
    }
    get_column_elem(column) {
        console.assert(column <= this.elem_cols.length, "column index too high")
        return this.elem_cols[column]
    }
    save() { return null }
    load(v) { }

    add_elems(parent) {
        this.line_elem = add_param_block(parent)
        this.label_elem = add_div(this.line_elem, "param_list_title")
        this.label_elem.innerText = this.label + ":"

        this.table_elem = add_div(this.line_elem)

        this.elem_cols = []

        for(let lst_prm of this.list_params) {
            let column = add_div(this.table_elem, "param_table_column")
            this.elem_cols.push(column)
            lst_prm.add_column_elems(column)
            let grip = add_div(column, "param_table_grip")
            add_grip_handlers(grip, column)
        }
    }
}


function add_grip_handlers(grip, cell) {
    var moving = false;
    var startOffset;
    var column_width;

    grip.addEventListener('mousedown', function(e) {
        moving = true;
        startOffset = parseFloat(window.getComputedStyle(cell)["width"]) - e.pageX;
    });
    document.addEventListener('mousemove', function(e) {
      if (moving) {
            column_width = startOffset + e.pageX
            cell.style.width = column_width + "px"
            e.preventDefault(); // prevent selection action from messing it up
      }
    });
    document.addEventListener('mouseup', function() {
        moving = false;
    });
}


class TextBlockParam extends Parameter 
{
    constructor(node, label) {
        super(node, label)
        this.dlg = null
        this.dlg_elem = null
        this.text_input = null
        this.dlg_rect = null
        this.text = ""
        node.rename_observers.push((name)=>{
            this.dlg.set_title(this.title())
        })
    }
    save() { return { dlg_rect: this.dlg_rect, text:this.text } }
    load(v) { this.text = v.text; this.dlg_rect = v.dlg_rect; }
    
    title() { return this.owner.name + " - " + this.label }
    set_text(v) { this.text = v; this.dirty = true }

    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label) // TBD hack need more space to spell "Fragment Shader" this should be automatic
        this.dlg = create_dialog(parent, this.title(), true, this.dlg_rect, (visible)=>{ edit_btn.checked = visible })
        this.dlg_elem = this.dlg.elem, this.dlg_rect = this.dlg.rect
        let [edit_btn, edit_disp] = add_checkbox_btn(this.line_elem, "Edit...", this.dlg.rect.visible, this.dlg.set_visible)

        this.text_input = add_elem(this.dlg_elem, "textarea", "param_text_area")
        this.text_input.spellcheck = false
        this.text_input.value = this.text
        this.text_input.addEventListener("input", ()=>{ this.text = this.text_input.value; this.dirty = true }) // TBD save and trigger draw after timeout
        //this.text_input.value = this.text        
    }
}


