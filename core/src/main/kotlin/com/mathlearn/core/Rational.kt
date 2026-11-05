package com.mathlearn.core

import java.math.BigInteger

/** Exact fraction arithmetic so 1/3 + 1/6 == 1/2 without floating-point error. */
class Rational private constructor(val num: BigInteger, val den: BigInteger) : Comparable<Rational> {

    companion object {
        val ZERO = Rational(BigInteger.ZERO, BigInteger.ONE)
        val ONE = Rational(BigInteger.ONE, BigInteger.ONE)

        fun of(n: Long, d: Long = 1): Rational = of(BigInteger.valueOf(n), BigInteger.valueOf(d))

        fun of(n: BigInteger, d: BigInteger): Rational {
            if (d.signum() == 0) throw ArithmeticException("Division by zero")
            val g = n.gcd(d).let { if (it.signum() == 0) BigInteger.ONE else it }
            var nn = n / g
            var dd = d / g
            if (dd.signum() < 0) { nn = nn.negate(); dd = dd.negate() }
            return Rational(nn, dd)
        }

        /** Parses a plain decimal literal such as "12", "0.75", ".5". */
        fun parseDecimal(s: String): Rational {
            val t = s.trim()
            val dot = t.indexOf('.')
            if (dot < 0) return of(BigInteger(t), BigInteger.ONE)
            val intPart = t.substring(0, dot).ifEmpty { "0" }
            val frac = t.substring(dot + 1)
            if (frac.isEmpty()) return of(BigInteger(intPart), BigInteger.ONE)
            val den = BigInteger.TEN.pow(frac.length)
            val sign = if (intPart.startsWith("-")) -1 else 1
            val whole = BigInteger(intPart)
            val f = BigInteger(frac)
            return of(whole * den + f * BigInteger.valueOf(sign.toLong()), den)
        }
    }

    operator fun plus(o: Rational) = of(num * o.den + o.num * den, den * o.den)
    operator fun minus(o: Rational) = of(num * o.den - o.num * den, den * o.den)
    operator fun times(o: Rational) = of(num * o.num, den * o.den)
    operator fun div(o: Rational) = of(num * o.den, den * o.num)
    operator fun unaryMinus() = Rational(num.negate(), den)

    fun pow(exp: Int): Rational =
        if (exp >= 0) Rational(num.pow(exp), den.pow(exp)) else ONE / pow(-exp)

    val isInteger: Boolean get() = den == BigInteger.ONE
    val signum: Int get() = num.signum()

    /** True when the value has a finite decimal expansion (denominator only has factors 2 and 5). */
    val isTerminatingDecimal: Boolean
        get() {
            var d = den
            val two = BigInteger.valueOf(2); val five = BigInteger.valueOf(5)
            while (d.mod(two).signum() == 0) d /= two
            while (d.mod(five).signum() == 0) d /= five
            return d == BigInteger.ONE
        }

    fun toDouble(): Double = num.toDouble() / den.toDouble()

    /** "3/4", "-5/2", or "7" for integers. */
    fun toFractionString(): String = if (isInteger) num.toString() else "$num/$den"

    /** "2 1/2" style mixed number for improper fractions. */
    fun toMixedString(): String {
        if (isInteger) return num.toString()
        val whole = num.abs() / den
        if (whole.signum() == 0) return toFractionString()
        val rem = num.abs().mod(den)
        val sign = if (num.signum() < 0) "-" else ""
        return "$sign$whole $rem/$den"
    }

    /** Exact decimal string when terminating, otherwise rounded to [maxDigits]. */
    fun toDecimalString(maxDigits: Int = 4): String {
        if (isInteger) return num.toString()
        val bd = num.toBigDecimal().divide(den.toBigDecimal(), maxDigits, java.math.RoundingMode.HALF_UP)
        return bd.stripTrailingZeros().toPlainString()
    }

    /** Friendly display: decimals if [preferDecimal] and terminating, else mixed number. */
    fun display(preferDecimal: Boolean): String =
        if (isInteger) num.toString()
        else if (preferDecimal && isTerminatingDecimal) toDecimalString(6)
        else toMixedString()

    override fun compareTo(other: Rational): Int = (num * other.den).compareTo(other.num * den)
    override fun equals(other: Any?) = other is Rational && num == other.num && den == other.den
    override fun hashCode() = 31 * num.hashCode() + den.hashCode()
    override fun toString() = toFractionString()
}
