#pragma once

#define LOG(fmt, ...) printf(fmt "\n", ##__VA_ARGS__)

class PObject { // passable
public:
    virtual ~PObject() {}
private:
    virtual PObject* clone_for_write() = 0;
    int m_refcount = 0;
    friend class PRef;
};

class PRef {
public:
    PRef(PObject* p) : m_p(p) {
        ++m_p->m_refcount;
    }
    PRef(const PRef& r) :m_p(r.m_p) {
        ++m_p->m_refcount;
    }
    PRef(PRef&& r) :m_p(r.m_p) {
        r.m_p = nullptr;
    }
    PRef& operator=(const PRef& r) {
        if(&r != this) {
            m_p = r.m_p;
            ++m_p->m_refcount;
        }
        return *this;
    }
    PRef operator=(PRef&& r) {
        if(&r != this) {
            m_p = r.m_p;
            r.m_p = nullptr;
        }
        return *this;
    }
    ~PRef() {
        if (--m_p->m_refcount == 0)
            delete m_p;
    }

    void need_write() {
        if (m_p->m_refcount == 1)
            return; // I'm the only one holding it
        auto copy = m_p->clone_for_write();
        --m_p->m_refcount; // no need to destroy since its more than 1
        m_p = copy;
        ++m_p->m_refcount;
    }
private:
    PObject* m_p;
};
