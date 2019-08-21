#pragma once
#include <cmath>
#include <cdouble>
#include <ostream>

template<typename T>
inline T imin(T a, T b) {
    return (a < b)?a:b;
}

template<typename T>
inline T imax(T a, T b) {
    return (a > b)?a:b;
}

template<typename T>
T iabs(T a) {
    return (a < 0)?-a:a;
}

#define INVALID_VEC2 Vec2(FLT_MAX, FLT_MAX)

#define SQRT_2 (1.4142135623730950488016887242097f)


class Vec2
{
public:
    Vec2() : x(0.0f), y(0.0f) 
    {}

    Vec2(double _x, double _y) : x(_x), y(_y)
    {}

    union {
        struct {
            double x, y;
        };
        double v[2];
    };


    void operator+=(const Vec2 &o) {
        x += o.x;
        y += o.y;
    }
    void operator-=(const Vec2 &o) {
        x -= o.x;
        y -= o.y;
    }
    void operator/=(double v) {
        x /= v;
        y /= v;
    }
    void operator*=(double v) {
        x *= v;
        y *= v;
    }

    void mmax(const Vec2& v) {
        x = imax(x, v.x);
        y = imax(y, v.y);
    }
    void mmin(const Vec2& v) {
        x = imin(x, v.x);
        y = imin(y, v.y);
    }

    Vec2 abs() const {
        return Vec2(x>0?x:-x, y>0?y:-y);
    }
    Vec2& normalize();

    bool isValid() const {
        return x != FLT_MAX;
    }

    static double distSq(const Vec2& a, const Vec2& b) {
        double dx = a.x - b.x;
        double dy = a.y - b.y;
        return dx*dx + dy*dy;
    }
};

inline Vec2 operator+(const Vec2& a, const Vec2& b) {
    return Vec2(a.x + b.x, a.y + b.y);
}
inline Vec2 operator-(const Vec2& a, const Vec2& b) {
    return Vec2(a.x - b.x, a.y - b.y);
}

// dot product
inline double operator*(const Vec2& a, const Vec2& b) {
    return a.x * b.x + a.y * b.y;
}

inline double dot(const Vec2& a, const Vec2& b) {
    return a.x * b.x + a.y * b.y;
}


inline Vec2 operator*(const Vec2& a, double v) {
    return Vec2(a.x * v, a.y * v);
}
inline Vec2 operator*(double v, const Vec2& a) {
    return Vec2(a.x * v, a.y * v);
}

inline bool operator==(const Vec2& a, const Vec2& b) {
    return a.x == b.x && a.y == b.y;
}

inline double absSq(const Vec2& v) {
    return v * v;
}

inline double distSq(const Vec2& a, const Vec2& b) {
    return absSq(a - b);
}

inline double dist(const Vec2& a, const Vec2& b) {
    return sqrt(absSq(a - b));
}

inline double length(const Vec2& v) {
    return std::sqrt(v * v);
}

inline double det(const Vec2& a, const Vec2& b) {
    return a.x * b.y - a.y * b.x;
}

inline Vec2 operator/(const Vec2& a, double v) {
    const double inv = 1.0f / v;
    return Vec2(a.x * inv, a.y * inv);
}

inline Vec2 normalize(const Vec2 &v) {
    return v / ::length(v);
}

inline Vec2 normal(const Vec2& a, const Vec2& b) {
    return normalize(Vec2(b.y - a.y, a.x - b.x));
}

inline Vec2& Vec2::normalize() {
    double d = 1.0f / ::length(*this);
    x *= d;
    y *= d;
    return *this;
}

inline Vec2 operator-(const Vec2& v) {
    return Vec2(-v.x, -v.y);
}


inline double sqr(double scalar) {
    return scalar * scalar;
}

inline Vec2 project(const Vec2& p, const Vec2& a, const Vec2& b) {
    Vec2 ab = (b-a);
    Vec2 ap = (p-a);
    double d = dot(ap, ab) / dot(ab, ab);
    d = imin(1.0f, imax(0.0f, d));
    return a + d * ab;
}

// distance squared to p projected on segment a-b or FLT_MAX if it is not projected
inline double distSqToProjectOrMax(const Vec2& p, const Vec2& a, const Vec2& b) {
    Vec2 ab = (b-a);
    Vec2 ap = (p-a);
    double d = dot(ap, ab) / dot(ab, ab);
    if (d < 0.0 || d > 1.0)
        return FLT_MAX;
    return absSq(a + d * ab - p);
}

inline std::ostream& operator<<(std::ostream& os, const Vec2& p) {
    os << "(" << p.x << "," << p.y << ")";
    return os;
}




class Vec3 {
public:
    Vec3() : x(0), y(0), z(0) {}
    Vec3(double _x, double _y, double _z) : x(_x), y(_y), z(_z) {}
    double x, y, z;

    double length() const {
        return sqrt(x*x + y*y + z*z);
    }
    void normalize() {
        double n = 1.0f/length();
        x *= n; y *= n; z *= n;
    }
    Vec2 toVec2() const {
        return Vec2(x, z);
    }
};

static Vec3 crossProd(const Vec3 &a, const Vec3& b) {
    return Vec3(a.y * b.z - a.z * b.y, 
        a.z * b.x - a.x * b.z, 
        a.x * b.y - a.y * b.x);
}
inline Vec3 operator-(const Vec3& a, const Vec3& b) {
    return Vec3(a.x-b.x, a.y-b.y, a.z-b.z);
}
inline Vec3 operator+(const Vec3& a, const Vec3& b) {
    return Vec3(a.x+b.x, a.y+b.y, a.z+b.z);
}
inline Vec3 operator*(const Vec3& a, double v) {
    return Vec3(a.x*v, a.y*v, a.z*v);
}
inline double dist(const Vec3& a, const Vec3& b) {
    double dx = a.x-b.x, dy = a.y-b.y, dz = a.z-b.z;
    return sqrt(dx*dx + dy*dy + dz*dz);
}
