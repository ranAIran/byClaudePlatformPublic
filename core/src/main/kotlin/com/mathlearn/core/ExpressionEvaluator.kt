package com.mathlearn.core

/**
 * Exact evaluator for school arithmetic: + − × ÷ : ^ ² ³ % parentheses, fractions,
 * decimals, mixed numbers ("2 3/4") and implicit multiplication ("2(3+4)").
 * Accepts the symbols children (and OCR) actually produce.
 */
object ExpressionEvaluator {

    class ParseException(message: String) : Exception(message)

    /** Returns null instead of throwing when [text] isn't a valid expression. */
    fun tryEvaluate(text: String): Rational? =
        try { evaluate(text) } catch (_: ParseException) { null } catch (_: ArithmeticException) { null }

    fun evaluate(text: String): Rational {
        val src = normalize(text)
        if (src.isBlank()) throw ParseException("empty")
        val p = Parser(src)
        val v = p.parseExpr()
        p.skipWs()
        if (!p.atEnd()) throw ParseException("Unexpected '${p.peek()}' at ${p.pos}")
        return v
    }

    /** True if [text] looks like a pure arithmetic expression (digits and operators only). */
    fun looksLikeArithmetic(text: String): Boolean {
        val n = normalize(text)
        if (n.none { it.isDigit() }) return false
        if (n.none { it in "+-*/^%" }) return false
        return n.all { it.isDigit() || it in "+-*/^%(). " }
    }

    internal fun normalize(text: String): String {
        var s = text
            .replace('×', '*').replace('·', '*').replace('⋅', '*').replace('∙', '*')
            .replace('÷', '/').replace(':', '/')
            .replace('−', '-').replace('–', '-').replace('—', '-')
            .replace('[', '(').replace(']', ')').replace('{', '(').replace('}', ')')
            .replace("²", "^2").replace("³", "^3")
        // "x" or "X" used as a times sign between numbers / brackets: 3 x 4, 3x4, (2)x(3)
        s = s.replace(Regex("(?<=[\\d)])\\s*[xX]\\s*(?=[\\d(])"), "*")
        // Decimal comma "2,5" (but keep thousands separators like "1,000")
        s = s.replace(Regex("(\\d),(\\d{3})(?!\\d)"), "$1$2")
        s = s.replace(Regex("(\\d),(\\d)"), "$1.$2")
        // Mixed numbers "2 3/4" -> (2+3/4)
        s = s.replace(Regex("(?<![\\d./])(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)(?![\\d.])")) {
            "(${it.groupValues[1]}+${it.groupValues[2]}/${it.groupValues[3]})"
        }
        return s.trim()
    }

    private class Parser(val s: String) {
        var pos = 0
        fun atEnd() = pos >= s.length
        fun peek(): Char = s[pos]
        fun skipWs() { while (!atEnd() && s[pos].isWhitespace()) pos++ }
        fun eat(c: Char): Boolean {
            skipWs()
            if (!atEnd() && s[pos] == c) { pos++; return true }
            return false
        }

        fun parseExpr(): Rational {
            var v = parseTerm()
            while (true) {
                v = when {
                    eat('+') -> v + parseTerm()
                    eat('-') -> v - parseTerm()
                    else -> return v
                }
            }
        }

        fun parseTerm(): Rational {
            var v = parseUnary()
            while (true) {
                skipWs()
                v = when {
                    eat('*') -> v * parseUnary()
                    eat('/') -> {
                        val d = parseUnary()
                        if (d.signum == 0) throw ArithmeticException("Division by zero")
                        v / d
                    }
                    !atEnd() && peek() == '(' -> v * parseUnary() // implicit: 2(3+4)
                    else -> return v
                }
            }
        }

        fun parseUnary(): Rational {
            if (eat('-')) return -parseUnary()
            if (eat('+')) return parseUnary()
            return parsePower()
        }

        fun parsePower(): Rational {
            val base = parsePostfix()
            if (eat('^')) {
                val e = parseUnary()
                if (!e.isInteger || e.num.abs() > java.math.BigInteger.valueOf(64)) {
                    throw ParseException("Unsupported exponent")
                }
                return base.pow(e.num.toInt())
            }
            return base
        }

        fun parsePostfix(): Rational {
            var v = parsePrimary()
            while (eat('%')) v = v / Rational.of(100)
            return v
        }

        fun parsePrimary(): Rational {
            skipWs()
            if (eat('(')) {
                val v = parseExpr()
                if (!eat(')')) throw ParseException("Missing ')'")
                return v
            }
            val start = pos
            while (!atEnd() && (s[pos].isDigit() || s[pos] == '.')) pos++
            if (start == pos) throw ParseException(if (atEnd()) "Unexpected end" else "Unexpected '${s[pos]}'")
            val lit = s.substring(start, pos)
            if (lit.count { it == '.' } > 1 || lit == ".") throw ParseException("Bad number '$lit'")
            val value = Rational.parseDecimal(lit)
            // "2/3" written tight (no spaces) is a fraction literal, so "2/3 ÷ 1/4" means (2/3) ÷ (1/4).
            if (!lit.contains('.') && pos + 1 < s.length && s[pos] == '/' && s[pos + 1].isDigit()) {
                val save = pos
                pos++
                val dStart = pos
                while (!atEnd() && s[pos].isDigit()) pos++
                if (!atEnd() && s[pos] == '.') { pos = save; return value } // "1/2.5": ordinary division
                val den = Rational.parseDecimal(s.substring(dStart, pos))
                if (den.signum == 0) throw ArithmeticException("Division by zero")
                return value / den
            }
            return value
        }
    }
}
