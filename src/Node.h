#pragma once

#include<vector>
#include<map>
#include<string>

#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>

class Node {
public:
    Node(emscripten::val& js_node) : m_jsnode(js_node) {}
    
    emscripten::val m_jsnode;
};


class TerminalBase {
public:
    TerminalBase() : m_jsterm(emscripten::val::null()) 
    {}
    void register_self(const char* name, Node* in_node, bool is_input, const char* cls_name) {
        emscripten::val c = emscripten::val::global(cls_name);
        if (c.isUndefined()) {
            LOG("can't find %s", cls_name);
            return;
        }
        m_jsterm = c.new_(std::string(name));
        in_node->m_jsnode[is_input ? "inputs":"outputs"].call<void>("push", m_jsterm);
    }

    emscripten::val m_jsterm;
};

template<typename T>
class InTerminal : public TerminalBase
{
public:
    InTerminal(Node* in_node, const char* name) {
        register_self(name, in_node, true, "Terminal");
    }
    void handle(T* v) {
    }
};

template<typename T>
class OutTerminal : public TerminalBase
{
public:
    OutTerminal(Node* in_node, const char* name) {
        register_self(name, in_node, false, "Terminal");
    }
    void send(T* v) {
        
    }
private:
    std::vector<InTerminal<T>> m_connectedTo;
};



class ParamBase;
class ParamProxy { // needed since we need to pass something by value into javascript instead of a raw pointer
public:    
    ParamProxy(ParamBase* _p) : p(_p) {}
    void pull_value();
    bool set_value(int item, const std::string& s);
    ParamBase* p;
};

class ParamBase {
public:
    ParamBase() : m_jsparam(emscripten::val::null()) 
    {}
    void register_self(const char* name, Node* in_node) {
        emscripten::val c = emscripten::val::global(jsName());
        if (c.isUndefined()) {
            LOG("can't find %s", jsName());
            return;
        }
        m_jsparam = c.new_(std::string(name), ParamProxy(this));
        in_node->m_jsnode["parameters"].call<void>("push", m_jsparam);
    }
    virtual const char* jsName() = 0;
    virtual void pull_value() = 0;
    virtual bool set_value(int item, const std::string& s) = 0;

    emscripten::val m_jsparam;
};

void ParamProxy::pull_value() { 
    p->pull_value(); 
}
bool ParamProxy::set_value(int item, const std::string& s) { 
    return p->set_value(item, s); 
}


template<typename T>
class Param : public ParamBase {
public:
    Param(Node* in_node, const char* name, const T& start_val) 
        : v(start_val)
    {
        register_self(name, in_node);
    }

    const char* jsName() override;
    void pull_value() override;
    bool set_value(int item, const std::string& emv) override;

    T v;
};

template<> const char* Param<Vec2d>::jsName() { return "ParamVec2"; }
template<> const char* Param<int>::jsName() { return "ParamInt"; }

template<> void Param<Vec2d>::pull_value() { m_jsparam.call<void>("init_val", v.x, v.y); }
template<> void Param<int>::pull_value() { m_jsparam.call<void>("init_val", v); }

bool try_to_float(const std::string& s, double* f) {
    char* endp = nullptr;
    *f = strtod(s.c_str(), &endp);
    return endp == s.c_str() + s.size();
}
bool try_to_int(const std::string& s, int* v) {
    char* endp = nullptr;
    *v = strtol(s.c_str(), &endp, 10);
    return endp == s.c_str() + s.size();
}


template<> bool Param<Vec2d>::set_value(int item, const std::string& s) { return try_to_float(s, &v.v[item]); }
template<> bool Param<int>::set_value(int item, const std::string& s) { return try_to_int(s, &v); }


