
class Parameter
{
    constructor(node, label) {
        this.label = label
        node.parameters.push(this)
    }
}

class ParamInt extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.value = 0
    }
}

class ParamVec2 extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
    }
    add_elems(parent) {
        let line = addTextChild(parent, "<div class='param_line'>\
<span class='param_label_pre'>LABEL:</span>\
<input class='param_input' type='text' spellcheck='false'>\
<input class='param_input' type='text' spellcheck='false'>\
</div>".replace(/LABEL/, this.label))
        this.elem_x = line.childNodes[1]
        this.elem_y = line.childNodes[2]
        this.elem_x.value = this.x
        this.elem_y.value = this.y
        let that = this
        this.elem_x.addEventListener("input", function() { that.x = that.elem_x.value; trigger_frame_draw() })
        this.elem_y.addEventListener("input", function() { that.y = that.elem_y.value; trigger_frame_draw() })
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
    }
}
