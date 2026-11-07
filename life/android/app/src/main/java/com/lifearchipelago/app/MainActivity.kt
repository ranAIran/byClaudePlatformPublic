package com.lifearchipelago.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognizerIntent
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * The Android shell around the shared web app (life/app). The 3D world, the data and the
 * interface are the same files the web version serves; this class adds what a web page
 * cannot do on a phone: the document scanner, the camera, native voice input, receiving
 * shares from other apps, and sharing files out.
 *
 * Web -> native: window.LifeAndroid (see Bridge below).
 * Native -> web: window.lifeBridge.onShare / onScanResult / onVoice / onError / back.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private var pageReady = false
    private val pending = mutableListOf<String>()
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val takePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val cb = fileCallback
        fileCallback = null
        val uri = cameraUri
        cb?.onReceiveValue(if (ok && uri != null) arrayOf(uri) else null)
    }

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val cb = fileCallback
        fileCallback = null
        cb?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }

    private val scanner = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { res: ActivityResult ->
        if (res.resultCode != Activity.RESULT_OK) return@registerForActivityResult
        val result = GmsDocumentScanningResult.fromActivityResultIntent(res.data)
        val pages = JSONArray()
        result?.pages?.forEach { page -> imageDataUrl(page.imageUri)?.let { pages.put(it) } }
        callJs("window.lifeBridge && lifeBridge.onScanResult(" + JSONObject().put("pages", pages).toString() + ")")
    }

    private val voice = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val text = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (res.resultCode == Activity.RESULT_OK && text != null) {
            callJs("window.lifeBridge && lifeBridge.onVoice(" + JSONObject.quote(text) + ")")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#16203D"))
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#16203D"))
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        // Keep the page clear of the status bar, navigation bar and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
        }
        web.addJavascriptInterface(Bridge(), "LifeAndroid")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                openExternal(request.url.toString())
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    if (params.isCaptureEnabled) {
                        val dir = File(cacheDir, "images").apply { mkdirs() }
                        val file = File(dir, "capture-${System.currentTimeMillis()}.jpg")
                        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", file)
                        cameraUri = uri
                        takePicture.launch(uri)
                    } else {
                        pickImage.launch("image/*")
                    }
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.lifeBridge ? lifeBridge.back() : 'false'") { result ->
                    if (result?.trim('"') != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        handleShare(intent)
        // The start page comes from the product flavor: Life Archipelago or Latent Archipelago.
        web.loadUrl("https://appassets.androidplatform.net/assets/www/" + getString(R.string.start_path))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShare(intent)
    }

    // ---------- calls into the page ----------
    private fun callJs(js: String) {
        runOnUiThread {
            if (pageReady) web.evaluateJavascript(js, null) else pending.add(js)
        }
    }

    private fun toastJs(message: String) = callJs("window.lifeBridge && lifeBridge.onError(" + JSONObject.quote(message) + ")")

    // ---------- shares from other apps ----------
    private fun handleShare(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
        val payload = JSONObject()
        intent.getStringExtra(Intent.EXTRA_TEXT)?.let { payload.put("text", it) }
        intent.getStringExtra(Intent.EXTRA_SUBJECT)?.let { payload.put("subject", it) }
        val uris = if (action == Intent.ACTION_SEND) listOfNotNull(streamUri(intent)) else streamUris(intent)
        val images = JSONArray()
        for (uri in uris) {
            val type = contentResolver.getType(uri) ?: intent.type ?: ""
            if (type.startsWith("image/")) imageDataUrl(uri)?.let { images.put(it) }
        }
        if (images.length() > 0) payload.put("images", images)
        callJs("window.lifeBridge && lifeBridge.onShare(" + payload.toString() + ")")
        intent.action = null // handle each share once
    }

    @Suppress("DEPRECATION")
    private fun streamUri(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else i.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun streamUris(i: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()

    /** Reads an image, scales it down to at most 1600 px, and returns a JPEG data URL. */
    private fun imageDataUrl(uri: Uri): String? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 1600) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val bmp = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
        if (bmp == null) null else {
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
            "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        }
    } catch (e: Exception) {
        null
    }

    // ---------- native features ----------
    private fun startScan() {
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(5)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(this)
            .addOnSuccessListener { sender -> scanner.launch(IntentSenderRequest.Builder(sender).build()) }
            .addOnFailureListener { e -> toastJs("Scanner unavailable: " + (e.message ?: "unknown error")) }
    }

    private fun startVoice(lang: String) {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Drop it into your bag")
        }
        try {
            voice.launch(i)
        } catch (e: ActivityNotFoundException) {
            toastJs("No voice input app on this phone")
        }
    }

    private fun shareText(title: String, text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(send, title))
    }

    /** Writes the file to the cache and opens the share sheet, so it can go to Drive, Files or email. */
    private fun saveAndShare(name: String, mime: String, text: String) {
        val dir = File(cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
        file.writeText(text)
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, name))
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            toastJs("No app can open this link")
        }
    }

    /** Methods the page can call as window.LifeAndroid.*. They run on a background thread. */
    inner class Bridge {
        @JavascriptInterface
        fun ready() {
            runOnUiThread {
                pageReady = true
                pending.forEach { web.evaluateJavascript(it, null) }
                pending.clear()
            }
        }

        @JavascriptInterface
        fun version(): String = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (e: Exception) {
            ""
        }

        @JavascriptInterface
        fun scanDocument() = runOnUiThread { startScan() }

        @JavascriptInterface
        fun voiceInput(lang: String) = runOnUiThread { startVoice(lang) }

        @JavascriptInterface
        fun shareText(title: String, text: String) = runOnUiThread { this@MainActivity.shareText(title, text) }

        @JavascriptInterface
        fun saveFile(name: String, mime: String, text: String) = runOnUiThread { saveAndShare(name, mime, text) }

        @JavascriptInterface
        fun openExternal(url: String) = runOnUiThread { this@MainActivity.openExternal(url) }
    }
}
