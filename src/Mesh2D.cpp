#include <stdio.h>
#include <vector>
#include "Vec2.h"
#include "PObject.h"
#include "Node.h"

#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace std;



enum EMeshType {
    TYPE_NONE,
    TYPE_TRI,
    TYPE_QUAD
};

class Mesh2D : public PObject
{
public:
    virtual ~Mesh2D() {}
    void add_vtx(float x, float y) {
        m_vtx.push_back(Vec2f(x, y));
    }
    void add_quad(int a, int b, int c, int d) {
        m_poly.insert(m_poly.end(), {a, b, c, d});
    }
private:
    vector<Vec2f> m_vtx;
    vector<int> m_poly;
    EMeshType m_type;
};




// ------------

class NodeGeomPrimitive : public Node
{
public:
    NodeGeomPrimitive(emscripten::val& js_node) : Node(js_node)
        ,m_size(this, "Size", Vec2d(0.5, 0.5))
        ,m_out_mesh(this, "out_mesh") 
    {}
    static constexpr const char* const s_name = "Geom_Primitive";
private:
    Param<Vec2d> m_size;
    OutTerminal<Mesh2D> m_out_mesh;
};

class NodeTestDummy : public Node
{
public:
    NodeTestDummy(emscripten::val& js_node) : Node(js_node)
        ,m_in_1(this, "in_1")
        ,m_in_2(this, "in_2")
        ,m_out_mesh(this, "out_mesh") 
    {}
    static constexpr const char* const s_name = "Test_Dummy";
private:
    InTerminal<Mesh2D> m_in_1;
    InTerminal<Mesh2D> m_in_2;
    OutTerminal<Mesh2D> m_out_mesh;
};


#define REG_NODE(cls_name) m_reg[cls_name::s_name] = [](emscripten::val& js_node){ return new cls_name(js_node); }

class NodeFactory {
public:
    void register_all() {
        REG_NODE(NodeGeomPrimitive);
        REG_NODE(NodeTestDummy);
    }

    Node* create(const char* name, emscripten::val& js_node) {
        auto it = m_reg.find(name);
        if (it == m_reg.end()) {
            LOG("Can't find node type %s", name);
            return nullptr;
        }
        return (it->second)(js_node);
    }
    std::map<string, std::function<Node*(emscripten::val&)>> m_reg;
};

NodeFactory g_node_factory;

std::unique_ptr<Node> create_node(const std::string& node_name, emscripten::val js_node) {
    try {
        return std::unique_ptr<Node>(g_node_factory.create(node_name.c_str(), js_node));
    } catch(...) {
        LOG("caught exception");
        return nullptr;
    }
}


void start() {
    LOG("Hello");
    g_node_factory.register_all();
}


EMSCRIPTEN_BINDINGS(my_module)
{
    emscripten::function("start", &start);
    emscripten::function("create_node", &create_node);
    //emscripten::function("delete_node", &delete_node);
    emscripten::class_<Node>("CppNode");
    emscripten::class_<ParamProxy>("CppParamProxy")
        .function("pull_value", &ParamProxy::pull_value)
        .function("set_value", &ParamProxy::set_value);
}



#if 0
int main() {
    test();
    return 0;
}
#endif
