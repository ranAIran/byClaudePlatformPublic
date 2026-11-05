package com.mathlearn.core

import java.util.UUID
import kotlin.random.Random

/**
 * Generates fresh 6th-grade exercises (Hebrew text, Israeli notation: "·" for multiplication,
 * ":" for division) with answer keys, hints and worked solutions.
 */
class ExerciseGenerator(private val random: Random = Random.Default) {

    fun generateSet(topic: Topic, count: Int = 10, kind: SetKind = SetKind.EXERCISES): ExerciseSet =
        ExerciseSet(
            id = UUID.randomUUID().toString(),
            title = topic.title + if (kind == SetKind.TEST) " – מבחן" else " – תרגול",
            kind = kind,
            source = SetSource.GENERATED,
            createdAt = System.currentTimeMillis(),
            exercises = List(count) { generate(topic) },
        )

    /** A mixed test drawing from every topic. */
    fun generateMixedTest(count: Int = 12): ExerciseSet =
        ExerciseSet(
            id = UUID.randomUUID().toString(),
            title = "מבחן מסכם – כיתה ו׳",
            kind = SetKind.TEST,
            source = SetSource.GENERATED,
            createdAt = System.currentTimeMillis(),
            exercises = List(count) { generate(Topic.practiceTopics[it % Topic.practiceTopics.size]) }.shuffled(random),
        )

    fun generate(topic: Topic): Exercise = when (topic) {
        Topic.FRACTIONS -> fractions()
        Topic.DECIMALS -> decimals()
        Topic.PERCENT -> percent()
        Topic.RATIO -> ratio()
        Topic.NEGATIVE_NUMBERS -> negatives()
        Topic.ORDER_OF_OPERATIONS -> orderOfOperations()
        Topic.DIVISIBILITY -> divisibility()
        Topic.GEOMETRY -> geometry()
        Topic.EQUATIONS -> equations()
        Topic.OTHER -> generate(Topic.practiceTopics.random(random))
    }

    private fun ex(topic: Topic, prompt: String, answer: String, hint: String, explanation: String) =
        Exercise(UUID.randomUUID().toString(), prompt, answer, emptyList(), hint, explanation, topic)

    private fun rnd(from: Int, to: Int) = random.nextInt(from, to + 1)

    private fun fraction(): Rational {
        val d = listOf(2, 3, 4, 5, 6, 8, 10, 12).random(random)
        return Rational.of(rnd(1, d - 1).toLong(), d.toLong())
    }

    private fun mixedNote(r: Rational) = if (!r.isInteger && r.num > r.den) " = ${r.toMixedString()}" else ""

    private fun fractions(): Exercise {
        val a = fraction(); val b = fraction()
        return when (rnd(0, 3)) {
            0 -> { val r = a + b; val common = a.den * b.den / a.den.gcd(b.den)
                ex(Topic.FRACTIONS, "$a + $b = ?", r.toFractionString(),
                    "מצאו קודם מכנה משותף.",
                    "מכנה משותף: $common. $a + $b = ${r.toFractionString()}${mixedNote(r)}") }
            1 -> { val (x, y) = if (a >= b) a to b else b to a; val r = x - y
                ex(Topic.FRACTIONS, "$x − $y = ?", r.toFractionString(),
                    "הביאו את שני השברים לאותו מכנה, ואז חסרו את המונים.",
                    "$x − $y = ${r.toFractionString()}") }
            2 -> { val r = a * b
                ex(Topic.FRACTIONS, "$a · $b = ?", r.toFractionString(),
                    "כופלים מונה במונה ומכנה במכנה.",
                    "(${a.num}·${b.num})/(${a.den}·${b.den}) = ${r.toFractionString()}") }
            else -> { val r = a / b
                ex(Topic.FRACTIONS, "$a : $b = ?", r.toFractionString(),
                    "חילוק בשבר = כפל בשבר ההפוך.",
                    "$a · ${b.den}/${b.num} = ${r.toFractionString()}${mixedNote(r)}") }
        }
    }

    private fun dec(maxInt: Int, places: Int): Rational =
        Rational.of(rnd(1, maxInt * pow10(places)).toLong(), pow10(places).toLong())

    private fun pow10(p: Int) = (1..p).fold(1) { acc, _ -> acc * 10 }

    private fun decimals(): Exercise {
        val a = dec(50, rnd(1, 2)); val b = dec(20, rnd(1, 2))
        return when (rnd(0, 2)) {
            0 -> { val r = a + b; ex(Topic.DECIMALS, "${a.toDecimalString()} + ${b.toDecimalString()} = ?",
                r.toDecimalString(), "סדרו את המספרים כך שהנקודות העשרוניות יהיו זו מתחת לזו.",
                "${a.toDecimalString()} + ${b.toDecimalString()} = ${r.toDecimalString()}") }
            1 -> { val (x, y) = if (a >= b) a to b else b to a; val r = x - y
                ex(Topic.DECIMALS, "${x.toDecimalString()} − ${y.toDecimalString()} = ?", r.toDecimalString(),
                    "יישרו את הנקודות העשרוניות, והוסיפו אפסים אם צריך.",
                    "${x.toDecimalString()} − ${y.toDecimalString()} = ${r.toDecimalString()}") }
            else -> { val x = dec(9, 1); val y = Rational.of(rnd(2, 12).toLong()); val r = x * y
                ex(Topic.DECIMALS, "${x.toDecimalString()} · $y = ?", r.toDecimalString(),
                    "כפלו כאילו אין נקודה, ואז החזירו את הנקודה העשרונית למקומה.",
                    "${x.toDecimalString()} · $y = ${r.toDecimalString()}") }
        }
    }

    private fun percent(): Exercise {
        val p = listOf(10, 20, 25, 50, 75, 5, 15, 30, 40, 60).random(random)
        val base = listOf(20, 40, 60, 80, 120, 200, 240, 300, 400).random(random)
        val part = Rational.of(p.toLong() * base, 100)
        val partS = part.display(true)
        return when (rnd(0, 2)) {
            0 -> ex(Topic.PERCENT, "כמה הם $p% מתוך $base?", partS,
                "$p% זה $p/100. כפלו ב-$base.", "$p/100 · $base = $partS")
            1 -> ex(Topic.PERCENT, "$partS הם כמה אחוזים מתוך $base?", "$p",
                "חלקו את החלק בשלם, ואז כפלו ב-100.", "$partS : $base · 100 = $p%")
            else -> { val newPrice = Rational.of(base.toLong()) - part
                ex(Topic.PERCENT, "חולצה עולה $base ₪. יש עליה הנחה של $p%. מה המחיר החדש?",
                    newPrice.display(true), "חשבו כמה הם $p% מתוך $base, ואז הפחיתו מהמחיר.",
                    "$p% מתוך $base = $partS; $base − $partS = ${newPrice.display(true)} ₪") }
        }
    }

    private fun ratio(): Exercise {
        val a = rnd(1, 5); val b = rnd(1, 6).let { if (it == a) it + 1 else it }
        val k = rnd(2, 9)
        val big = maxOf(a, b)
        return if (random.nextBoolean()) {
            val total = (a + b) * k
            ex(Topic.RATIO, "מחלקים $total גולות ביחס $a : $b. כמה גולות יש בחלק הגדול?",
                "${big * k}", "חברו את חלקי היחס ($a + $b) ומצאו כמה שווה חלק אחד.",
                "$total : ${a + b} = $k לכל חלק; החלק הגדול = $big · $k = ${big * k}")
        } else {
            ex(Topic.RATIO, "$a מחברות עולות ${a * k} ₪. כמה יעלו ${b * a} מחברות?",
                "${b * a * k}", "מצאו קודם את המחיר של מחברת אחת.",
                "מחברת אחת = ${a * k} : $a = $k ₪; ${b * a} · $k = ${b * a * k} ₪")
        }
    }

    private fun signed(n: Int) = if (n < 0) "($n)" else "$n"

    private fun negatives(): Exercise {
        val a = rnd(-20, 20); val b = rnd(-20, 20).let { if (it == 0) -3 else it }
        return when (rnd(0, 2)) {
            0 -> ex(Topic.NEGATIVE_NUMBERS, "${signed(a)} + ${signed(b)} = ?", "${a + b}",
                "דמיינו ישר מספרים: הוספת מספר שלילי מזיזה שמאלה.", "${signed(a)} + ${signed(b)} = ${a + b}")
            1 -> ex(Topic.NEGATIVE_NUMBERS, "${signed(a)} − ${signed(b)} = ?", "${a - b}",
                "חיסור מספר זה כמו חיבור המספר הנגדי לו.", "${signed(a)} + ${signed(-b)} = ${a - b}")
            else -> { val x = rnd(-9, 9).let { if (it == 0) 2 else it }; val y = rnd(-9, 9).let { if (it == 0) -4 else it }
                ex(Topic.NEGATIVE_NUMBERS, "${signed(x)} · ${signed(y)} = ?", "${x * y}",
                    "סימנים זהים ← חיובי, סימנים שונים ← שלילי.", "${signed(x)} · ${signed(y)} = ${x * y}") }
        }
    }

    private fun orderOfOperations(): Exercise {
        val a = rnd(2, 12); val b = rnd(2, 9); val c = rnd(2, 9); val d = rnd(1, 9)
        val prompt = when (rnd(0, 2)) {
            0 -> "$a + $b · $c"
            1 -> "($a + $b) · $c − $d"
            else -> "$a · $d + ${b * c} : $c"
        }
        val v = ExpressionEvaluator.evaluate(prompt)
        return ex(Topic.ORDER_OF_OPERATIONS, "$prompt = ?", v.toFractionString(),
            "קודם סוגריים, אחר כך כפל וחילוק, ובסוף חיבור וחיסור.", "$prompt = ${v.toFractionString()}")
    }

    private fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

    private fun divisibility(): Exercise {
        val k = rnd(2, 8); val a = k * rnd(2, 7); val b = k * rnd(2, 7).let { if (it * k == a) it + 1 else it }
        return when (rnd(0, 2)) {
            0 -> ex(Topic.DIVISIBILITY, "מהו המחלק המשותף הגדול ביותר של $a ושל $b?", "${gcd(a, b)}",
                "רשמו את המחלקים של כל מספר ומצאו את הגדול ביותר שמשותף לשניהם.", "המחלק המשותף הגדול = ${gcd(a, b)}")
            1 -> { val x = rnd(2, 12); val y = rnd(2, 12); val l = x / gcd(x, y) * y
                ex(Topic.DIVISIBILITY, "מהי הכפולה המשותפת הקטנה ביותר של $x ושל $y?", "$l",
                    "רשמו כפולות של המספר הגדול עד שתמצאו אחת שמתחלקת גם במספר השני.", "הכפולה המשותפת הקטנה = $l") }
            else -> { val n = rnd(100, 999); val d = listOf(3, 9).random(random); val s = n.toString().sumOf { it - '0' }
                ex(Topic.DIVISIBILITY, "האם $n מתחלק ב-$d ללא שארית? (כן / לא)", if (n % d == 0) "כן" else "לא",
                    "חברו את הספרות: מספר מתחלק ב-$d אם סכום ספרותיו מתחלק ב-$d.",
                    "סכום הספרות הוא $s, ${if (s % d == 0) "והוא מתחלק" else "והוא לא מתחלק"} ב-$d.") }
        }
    }

    private fun geometry(): Exercise {
        val w = rnd(2, 15); val h = rnd(2, 12)
        return when (rnd(0, 2)) {
            0 -> ex(Topic.GEOMETRY, "אורך מלבן $w ס״מ ורוחבו $h ס״מ. מה שטחו (בסמ״ר)?", "${w * h}",
                "שטח מלבן = אורך · רוחב.", "$w · $h = ${w * h} סמ״ר")
            1 -> ex(Topic.GEOMETRY, "אורך מלבן $w ס״מ ורוחבו $h ס״מ. מה היקפו (בס״מ)?",
                "${2 * (w + h)}", "היקף מלבן = 2 · (אורך + רוחב).", "2 · ($w + $h) = ${2 * (w + h)} ס״מ")
            else -> { val base = rnd(2, 12) * 2; val r = Rational.of((base * h).toLong(), 2)
                ex(Topic.GEOMETRY, "למשולש בסיס של $base ס״מ וגובה של $h ס״מ. מה שטחו (בסמ״ר)?",
                    r.display(true), "שטח משולש = בסיס · גובה : 2.", "$base · $h : 2 = ${r.display(true)} סמ״ר") }
        }
    }

    private fun equations(): Exercise {
        val x = rnd(-5, 15); val a = rnd(2, 9); val b = rnd(1, 20)
        return when (rnd(0, 2)) {
            0 -> ex(Topic.EQUATIONS, "x + $b = ${x + b}. מהו x?", "$x",
                "החסירו $b משני האגפים.", "x = ${x + b} − $b = $x")
            1 -> ex(Topic.EQUATIONS, "${a}x = ${a * x}. מהו x?", "$x",
                "חלקו את שני האגפים ב-$a.", "x = ${a * x} : $a = $x")
            else -> ex(Topic.EQUATIONS, "${a}x + $b = ${a * x + b}. מהו x?", "$x",
                "קודם החסירו $b, ואחר כך חלקו ב-$a.", "${a}x = ${a * x}  ←  x = $x")
        }
    }
}
