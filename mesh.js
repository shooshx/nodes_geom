

MESH_NOT_SET = 0
MESH_QUAD = 1
MESH_TRI = 2

class Mesh
{
    constructor() {
        this.vtx = new Float32Array(0)
        this.poly = new Int16Array(0)
        this.type = MESH_NOT_SET
    }

    set_vtx(arr) {
        this.vtx = arr
    }
    set_idx(arr) {
        this.poly = arr
    }
    set_type(v) {
        this.type = t
    }
}

