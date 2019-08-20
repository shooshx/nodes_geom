#include <stdio.h>
#include <vector>
#include "Vec2.h"

#ifdef EMSCRIPTEN
#include <emscripten.h>
#include <emscripten/bind.h>
#endif

using namespace std;

enum EMeshType {
    TYPE_NONE,
    TYPE_TRI,
    TYPE_QUAD
};

class Mesh2D 
{
    void add_vtx(float x, float y) {
        m_vtx.push_back(Vec2(x, y));
    }
    void add_quad(int a, int b, int c, int d) {
        m_poly.insert(m_poly.end(), {a, b, c, d});
    }
private:
    vector<Vec2> m_vtx;
    vector<int> m_poly;
    EMeshType m_type;
};


template<typename T>
class InTerminal
{
public:
    void handle(T* v) {
    }
};

template<typename T>
class OutTerminal 
{
public:
    void send(T* v) {
        
    }
private:
    vector<InTerminal<T>> m_connectedTo;
};

class NodeGeomPrimitive
{
public:

private:
    OutTerminal<Mesh2D> m_out_mesh;
};


void test() {
    printf("Hello\n");
}



#ifdef EMSCRIPTEN
EMSCRIPTEN_BINDINGS(my_module)
{
    emscripten::function("test", &test);
}
#endif



#if 0
int main() {
    test();
    return 0;
}
#endif
