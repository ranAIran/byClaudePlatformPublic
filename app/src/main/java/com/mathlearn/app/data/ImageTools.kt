package com.mathlearn.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max

object ImageTools {

    /** Long-edge size that keeps text legible for OCR/vision while keeping uploads small. */
    private const val MAX_EDGE = 1600

    /** Decodes [uri] (honouring EXIF rotation on API 28+) and downscales it. */
    fun loadBitmap(context: Context, uri: Uri): Bitmap {
        val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                val longEdge = max(info.size.width, info.size.height)
                if (longEdge > MAX_EDGE) {
                    val scale = MAX_EDGE.toFloat() / longEdge
                    decoder.setTargetSize((info.size.width * scale).toInt(), (info.size.height * scale).toInt())
                }
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, opts) }
                ?: throw IllegalArgumentException("לא ניתן לקרוא את התמונה")
        }
        val longEdge = max(bitmap.width, bitmap.height)
        if (longEdge <= MAX_EDGE) return bitmap
        val scale = MAX_EDGE.toFloat() / longEdge
        return Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
    }

    /** Renders the pages of a PDF (up to [maxPages]) as white-background bitmaps for OCR / Claude. */
    fun loadPdfPages(context: Context, uri: Uri, maxPages: Int = 6): List<Bitmap> {
        val fd = context.contentResolver.openFileDescriptor(uri, "r")
            ?: throw IllegalArgumentException("לא ניתן לפתוח את קובץ ה-PDF")
        return fd.use { pfd ->
            PdfRenderer(pfd).use { renderer ->
                (0 until minOf(renderer.pageCount, maxPages)).map { i ->
                    renderer.openPage(i).use { page ->
                        val scale = MAX_EDGE.toFloat() / max(page.width, page.height)
                        val bmp = Bitmap.createBitmap(
                            (page.width * scale).toInt(), (page.height * scale).toInt(), Bitmap.Config.ARGB_8888,
                        )
                        bmp.eraseColor(Color.WHITE) // PDF pages are transparent; OCR needs a white page
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bmp
                    }
                }
            }
        }
    }

    fun toJpeg(bitmap: Bitmap, quality: Int = 85): ByteArray =
        ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            out.toByteArray()
        }

    /** Runs on-device ML Kit text recognition and returns the text in reading order. */
    suspend fun recognizeText(bitmap: Bitmap): String = suspendCancellableCoroutine { cont ->
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { result ->
                // Sort blocks top-to-bottom so numbered items come out in order.
                val text = result.textBlocks
                    .sortedBy { it.boundingBox?.top ?: 0 }
                    .flatMap { block -> block.lines.map { it.text } }
                    .joinToString("\n")
                cont.resume(text)
            }
            .addOnFailureListener { cont.resumeWithException(it) }
            .addOnCompleteListener { recognizer.close() }
    }
}
