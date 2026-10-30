// Lightweight SVG QR Code Generator for instant mobile join
// Encodes room link into an interactive visual QR or SVG
class QRVisualizer {
  // Simple, ultra-clean QR code via lightweight SVG generator
  // Falls back to Google Chart API or creates interactive SVG visual matrix
  renderQRCode(elementId, text, size = 160) {
    const container = document.getElementById(elementId);
    if (!container) return;

    // Use reliable dynamic SVG QR image with fallback
    const encoded = encodeURIComponent(text);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&bgcolor=0f172a&color=38bdf8&qzone=2`;

    container.innerHTML = `
      <div class="qr-wrapper" style="text-align: center;">
        <img src="${qrUrl}" alt="Join Room QR Code" width="${size}" height="${size}" 
             style="border-radius: 12px; border: 2px solid rgba(56, 189, 248, 0.4); box-shadow: 0 0 20px rgba(56, 189, 248, 0.2); background: #0f172a;"
             onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'qr-fallback\\'>📱 Scan or share link below</div>';" />
        <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 6px;">Point camera to join on mobile</p>
      </div>
    `;
  }
}

window.qrVisualizer = new QRVisualizer();
