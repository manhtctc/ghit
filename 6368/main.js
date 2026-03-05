let map, familyMap, marker, familyMarker;
let latitude = 0,
  longitude = 0;
let sharingInterval;
let currentStatus = "safe";
let userId = null; // Sẽ được gán từ Firebase Auth

const WEATHER_API_KEY = "04910e6226234339944112242260303";
const GROQ_API_KEY = "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";

function initMap(lat, lon) {
  if (!map) {
    map = L.map("map").setView([lat, lon], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
  } else {
    map.setView([lat, lon], 13);
  }
  if (marker) marker.setLatLng([lat, lon]);
  else
    marker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup("Vị trí của bạn")
      .openPopup();
}

function initFamilyMap(lat, lon) {
  if (!familyMap) {
    familyMap = L.map("family-map").setView([lat, lon], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      familyMap,
    );
  } else {
    familyMap.setView([lat, lon], 12);
  }
  if (familyMarker) familyMarker.setLatLng([lat, lon]);
  else
    familyMarker = L.marker([lat, lon])
      .addTo(familyMap)
      .bindPopup("Vị trí gia đình");
}

// Lấy vị trí hiện tại
document.getElementById("get-location").addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        document.getElementById("location-info").textContent =
          `Vĩ độ: ${latitude.toFixed(6)}, Kinh độ: ${longitude.toFixed(6)}`;
        initMap(latitude, longitude);
        checkWeatherAndAI(latitude, longitude);
      },
      (err) => alert("Không lấy được vị trí: " + err.message),
      { enableHighAccuracy: true },
    );
  } else {
    alert("Trình duyệt không hỗ trợ GPS.");
  }
});

// Cập nhật trạng thái
document.getElementById("update-status").addEventListener("click", () => {
  currentStatus = document.getElementById("status-select").value;
  const txt =
    currentStatus === "safe"
      ? "🟢 An toàn"
      : currentStatus === "warning"
        ? "🟡 Cần theo dõi"
        : "🔴 Nguy hiểm";
  document.getElementById("current-status").textContent =
    `Trạng thái hiện tại: ${txt}`;
});

// Nút KHẨN CẤP
document.getElementById("emergency-btn").addEventListener("click", () => {
  if (!latitude || !longitude) return alert("Vui lòng lấy vị trí trước!");
  const time = new Date().toLocaleString("vi-VN");
  alert(
    `ĐÃ GỬI KHẨN CẤP!\nVị trí: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nThời gian: ${time}`,
  );
  document.getElementById("alert-info").textContent =
    "Cảnh báo khẩn cấp đã gửi!";
});
// Chia sẻ vị trí dùng UID tự động
document.getElementById("start-sharing").addEventListener("click", () => {
  if (sharingInterval) return alert("Đang chia sẻ rồi!");
  if (!window.userId)
    return alert("Đang chờ đăng nhập Firebase... Reload trang thử lại!");

  sharingInterval = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        initMap(latitude, longitude);

        const userRef = ref(window.db, `locations/${window.userId}`);
        set(userRef, {
          lat: latitude,
          lng: longitude,
          status: currentStatus,
          timestamp: new Date().toISOString(),
          name: "User_" + window.userId.slice(0, 6),
        }).catch((err) => console.error("Lỗi chia sẻ:", err));
      },
      () => {},
      { enableHighAccuracy: true },
    );
  }, 10000);

  document.getElementById("sharing-status").textContent =
    `Chia sẻ: Bật (UID: ${window.userId.slice(0, 8)}...)`;
});

document.getElementById("stop-sharing").addEventListener("click", () => {
  if (sharingInterval) {
    clearInterval(sharingInterval);
    sharingInterval = null;
    document.getElementById("sharing-status").textContent = "Chia sẻ: Tắt";
  }
});

// Kết bạn theo UID
document.getElementById("add-friend").addEventListener("click", () => {
  const friendUid = document.getElementById("friend-uid").value.trim();
  if (!friendUid || friendUid === window.userId) {
    return alert("Vui lòng dán UID hợp lệ của bạn bè (khác UID của bạn)!");
  }

  const friendsRef = ref(window.db, `friends/${window.userId}/${friendUid}`);
  set(friendsRef, true)
    .then(() => {
      alert(
        `Đã kết bạn với UID ${friendUid}! Vị trí của họ sẽ hiển thị nếu họ đang chia sẻ.`,
      );
      document.getElementById("friend-uid").value = "";
    })
    .catch((err) => console.error("Lỗi thêm bạn:", err));
});

// Theo dõi danh sách bạn bè
let friends = [];
onValue(ref(window.db, `friends/${window.userId}`), (snapshot) => {
  friends = [];
  snapshot.forEach((child) => {
    friends.push(child.key);
  });
  console.log("Danh sách bạn bè hiện tại:", friends);
});

// Theo dõi vị trí (tối ưu không lặp thông báo)

let knownKeys = new Set();

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.background = "#4caf50";
  toast.style.color = "white";
  toast.style.padding = "12px 20px";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  toast.style.zIndex = "1000";
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 5000);
}

onValue(ref(window.db, "locations"), (snapshot) => {
  const data = snapshot.val();
  console.log("Dữ liệu locations từ Firebase:", data); // Debug quan trọng

  if (!data || Object.keys(data).length === 0) {
    document.getElementById("family-location").textContent =
      "Chưa có ai đang chia sẻ vị trí";
    return;
  }

  let html = "Vị trí đang chia sẻ (real-time):<br>";
  let markers = [];
  let newFriendsDetected = false;
  let newFriendNames = [];

  Object.entries(data).forEach(([key, val]) => {
    const time = new Date(val.timestamp).toLocaleTimeString("vi-VN");
    const displayName = val.name || key.slice(0, 8) + "...";
    html += `${displayName}: ${val.lat.toFixed(5)}, ${val.lng.toFixed(5)} | ${val.status} | ${time}<br>`;

    // Hiển thị marker cho chính mình và bạn bè
    if (key === window.userId || friends.includes(key)) {
      const marker = L.marker([val.lat, val.lng])
        .addTo(familyMap)
        .bindPopup(
          `<b>${displayName}</b><br>Trạng thái: ${val.status}<br>Cập nhật: ${time}`,
        );
      markers.push(marker);

      if (!knownKeys.has(key) && key !== window.userId) {
        knownKeys.add(key);
        newFriendsDetected = true;
        newFriendNames.push(displayName);
      }
    }
  });

  document.getElementById("family-location").innerHTML = html;

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    familyMap.fitBounds(group.getBounds(), { padding: [60, 60] });
  } else if (Object.keys(data).length > 0) {
    const first = Object.values(data)[0];
    if (first) initFamilyMap(first.lat, first.lng);
  }

  if (newFriendsDetected) {
    const friendText =
      newFriendNames.length > 1
        ? `${newFriendNames.length} bạn bè mới`
        : `bạn ${newFriendNames[0] || "mới"}`;
    showToast(`Có ${friendText} đang chia sẻ vị trí! Đã hiển thị trên bản đồ.`);
  }
});

// Thời tiết + Phân tích sâu bằng Groq (đổi model)
async function checkWeatherAndAI(lat, lon) {
  document.getElementById("weather-info").innerHTML =
    '<i class="fas fa-spinner fa-spin icon-anim" style="color: #1e88e5;"></i> Thời tiết: Đang tải...';
  document.getElementById("ai-analysis").innerHTML =
    '<i class="fas fa-brain fa-pulse icon-anim" style="color: #673ab7;"></i> Phân tích sâu: Đang xử lý...';

  let weatherData = null;

  if (WEATHER_API_KEY !== "YOUR_WEATHERAPI_KEY_HERE") {
    try {
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=2&alerts=yes&lang=vi`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`WeatherAPI lỗi ${res.status}`);
      const data = await res.json();

      weatherData = {
        current: data.current,
        day: data.forecast.forecastday[0],
        alerts: data.alerts?.alert || [],
      };

      let riskText =
        'Thấp <i class="fas fa-check-circle icon-anim" style="color: green;"></i>';
      let riskColor = "green";
      if (
        weatherData.current.wind_kph > 40 ||
        weatherData.day.day.maxwind_kph > 50
      ) {
        riskText =
          'Trung bình – Gió mạnh <i class="fas fa-wind icon-anim" style="color: orange;"></i>';
        riskColor = "orange";
      }
      if (weatherData.day.day.totalprecip_mm > 50) {
        riskText =
          'Cao – Nguy cơ ngập <i class="fas fa-cloud-shower-heavy icon-anim" style="color: red;"></i>';
        riskColor = "red";
      }
      if (weatherData.alerts.length > 0) {
        riskText =
          'RẤT CAO – CÓ CẢNH BÁO <i class="fas fa-exclamation-triangle icon-anim" style="color: darkred;"></i>';
        riskColor = "darkred";
      }

      document.getElementById("weather-info").innerHTML =
        '<div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 1.1em; align-items: center; padding: 10px; background: #f8f9fa; border-radius: 8px;">' +
        '<span><i class="fas fa-cloud-sun icon-anim" style="color: #1e88e5;"></i> ' +
        (weatherData.current.condition.text || "N/A") +
        "</span>" +
        '<span><i class="fas fa-thermometer-half icon-anim" style="color: #ff5722;"></i> ' +
        (weatherData.current.temp_c || "N/A") +
        "°C</span>" +
        '<span><i class="fas fa-tint icon-anim" style="color: #2196f3;"></i> Độ ẩm: ' +
        (weatherData.current.humidity || "N/A") +
        "%</span>" +
        '<span><i class="fas fa-wind icon-anim" style="color: #607d8b;"></i> Gió: ' +
        (weatherData.current.wind_kph || "N/A") +
        " km/h</span>" +
        '<span><i class="fas fa-umbrella icon-anim" style="color: navy;"></i> Mưa: ' +
        (weatherData.day.day.totalprecip_mm || "N/A") +
        "mm</span>" +
        '<span style="color: ' +
        riskColor +
        '; font-weight: bold;"><i class="fas fa-exclamation-circle icon-anim" style="color: ' +
        riskColor +
        ';"></i> Rủi ro: ' +
        riskText +
        "</span>" +
        "</div>";
    } catch (err) {
      document.getElementById("weather-info").innerHTML =
        '<i class="fas fa-exclamation-circle" style="color: red;"></i> Thời tiết: Lỗi - ' +
        err.message;
    }
  } else {
    document.getElementById("weather-info").innerHTML =
      '<i class="fas fa-key" style="color: gray;"></i> Thời tiết: Chưa có key WeatherAPI';
  }

  // Phân tích Groq (đổi model)
  try {
    const prompt = `Bạn là chuyên gia khí tượng Việt Nam. Phân tích chi tiết rủi ro thời tiết tại khu vực Hà Nội hoặc gần đó dựa trên dữ liệu:
- Nhiệt độ: ${weatherData?.current?.temp_c || "N/A"}°C
- Độ ẩm: ${weatherData?.current?.humidity || "N/A"}%
- Gió: ${weatherData?.current?.wind_kph || "N/A"} km/h (hướng ${weatherData?.current?.wind_dir || "N/A"})
- Lượng mưa hôm nay: ${weatherData?.day?.day?.totalprecip_mm || "N/A"} mm
- Mô tả hiện tại: ${weatherData?.current?.condition?.text || "N/A"}
- Dự báo hôm nay: ${weatherData?.day?.day?.condition?.text || "N/A"}
${weatherData?.alerts?.length > 0 ? "CÓ CẢNH BÁO CHÍNH THỨC: " + weatherData.alerts[0].headline + " - " + weatherData.alerts[0].desc : ""}

Đánh giá rủi ro chi tiết (Thấp / Trung bình / Cao / Rất cao), giải thích lý do bằng tiếng Việt (đề cập đến nguy cơ ngập lụt, lũ quét, gió giật, cây đổ, ảnh hưởng giao thông, khu vực thấp trũng như sông Hồng, cầu vượt nếu có). Đưa ra gợi ý hành động cụ thể, thực tế cho người dùng (ví dụ: tránh ra đường, chuẩn bị đồ dùng khẩn cấp, theo dõi VTV, liên hệ gia đình, di chuyển đến nơi cao ráo). Giữ ngắn gọn nhưng sâu sắc, hữu ích. Định dạng với emoji/icon: dùng 🔴 cho rủi ro cao, 🟠 trung bình, 🟢 thấp, ☔ cho mưa, 🌬️ cho gió, ⚠️ cho cảnh báo, 🚗 cho giao thông, 🌊 cho lũ. Sử dụng bullet points với - để dễ đọc. Bắt đầu bằng tiêu đề rủi ro in đậm.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // Model mới hoạt động
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq lỗi ${res.status}: ${errText}`);
    }

    const json = await res.json();
    let aiText =
      json.choices?.[0]?.message?.content || "(Không có phân tích từ Groq)";

    let formattedText = aiText
      .replace(/\n/g, "<br>")
      .replace(/- /g, '<i class="fas fa-arrow-right icon-anim ai-bullet"></i> ')
      .replace(
        /🔴|🟠|🟢|☔|🌬️|⚠️|🚗|🌊/g,
        (match) => `<span class="emoji-anim">${match}</span>`,
      );

    document.getElementById("ai-analysis").innerHTML =
      '<div class="ai-title"><i class="fas fa-brain icon-anim" style="color: #673ab7;"></i> Phân tích sâu từ Groq AI (miễn phí)</div>' +
      formattedText;
  } catch (err) {
    console.error("Groq lỗi:", err);
    document.getElementById("ai-analysis").innerHTML =
      '<i class="fas fa-exclamation-triangle icon-anim" style="color: red; animation: shake 0.8s infinite;"></i> ' +
      "(LỖI: " +
      err.message +
      ")<br>Kiểm tra quota tại https://console.groq.com/settings/limits";
  }

  // Fallback (giữ nguyên)
  if (
    document.getElementById("ai-analysis").innerHTML.includes("LỖI") ||
    document.getElementById("ai-analysis").innerHTML.includes("Không có") ||
    document.getElementById("ai-analysis").innerHTML.includes("Đang xử lý...")
  ) {
    const now = new Date();
    const hour = now.getHours();
    let buoi = "Buổi sáng";
    let iconBuoi = "☀️";
    let colorBuoi = "#ff9800";

    if (hour >= 6 && hour < 11) {
      buoi = "Buổi sáng";
      iconBuoi = "☀️";
      colorBuoi = "#ff9800";
    } else if (hour >= 11 && hour < 14) {
      buoi = "Buổi trưa";
      iconBuoi = "☀️";
      colorBuoi = "#ff5722";
    } else if (hour >= 14 && hour < 18) {
      buoi = "Buổi chiều";
      iconBuoi = "🌤️";
      colorBuoi = "#fb8c00";
    } else {
      buoi = "Buổi tối";
      iconBuoi = "🌙";
      colorBuoi = "#673ab7";
    }

    const thoiGian = now.toLocaleString("vi-VN", {
      dateStyle: "full",
      timeStyle: "short",
    });

    let fallback =
      '<div class="ai-title" style="display: flex; align-items: center; gap: 8px;">' +
      '<i class="fas fa-robot icon-anim" style="color: #555;"></i> ' +
      '<span style="color: ' +
      colorBuoi +
      '; font-weight: bold;">' +
      iconBuoi +
      " " +
      buoi +
      " - " +
      thoiGian +
      "</span>" +
      "</div>";

    fallback +=
      '<div style="margin: 12px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 5px solid #1e88e5;">' +
      "<strong>Thông tin thời tiết hiện tại:</strong><br>" +
      '<i class="fas fa-cloud-sun icon-anim" style="color: #1e88e5;"></i> Trạng thái: ' +
      (weatherData?.current?.condition?.text || "N/A") +
      "<br>" +
      '<i class="fas fa-thermometer-half icon-anim" style="color: #ff5722;"></i> Nhiệt độ: ' +
      (weatherData?.current?.temp_c || "N/A") +
      "°C<br>" +
      '<i class="fas fa-tint icon-anim" style="color: #2196f3;"></i> Độ ẩm: ' +
      (weatherData?.current?.humidity || "N/A") +
      "%<br>" +
      '<i class="fas fa-wind icon-anim" style="color: #607d8b;"></i> Gió: ' +
      (weatherData?.current?.wind_kph || "N/A") +
      " km/h<br>" +
      '<i class="fas fa-umbrella icon-anim" style="color: navy;"></i> Mưa hôm nay: ' +
      (weatherData?.day?.day?.totalprecip_mm || "N/A") +
      " mm<br>" +
      "</div>";

    if (weatherData) {
      const rain = weatherData.day.day.totalprecip_mm;
      const wind = weatherData.current.wind_kph;

      if (rain > 50 || wind > 40) {
        fallback +=
          '<br><span class="emoji-anim">🔴</span> <strong>Rủi ro cao:</strong> Mưa lớn hoặc gió mạnh có thể gây ngập cục bộ (khu vực thấp trũng, sông Hồng), cây đổ, giao thông ùn tắc, nguy cơ lũ quét ngoại thành.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: red;"></i> Tránh ra đường nếu không cần thiết, đặc biệt cầu vượt, hầm chui.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: red;"></i> Chuẩn bị khẩn cấp: đèn pin, nước sạch, thực phẩm khô, sạc dự phòng, thuốc men.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: red;"></i> Theo dõi VTV, Trung tâm Khí tượng, Zalo OA cảnh báo địa phương.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: red;"></i> Liên hệ gia đình ngay, báo vị trí nếu ở khu vực nguy hiểm.';
        document.getElementById("alert-info").innerHTML =
          '<i class="fas fa-exclamation-triangle icon-anim" style="color: darkred; animation: pulse 1.5s infinite;"></i> CẢNH BÁO CAO: Thời tiết xấu – Nhấn KHẨN CẤP nếu cần hỗ trợ!';
      } else if (rain > 20 || wind > 25) {
        fallback +=
          '<br><span class="emoji-anim">🟠</span> <strong>Rủi ro trung bình:</strong> Mưa vừa + gió, đường trơn, dễ ùn tắc nhẹ, cây rung lắc.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: orange;"></i> Cẩn thận khi di chuyển, giảm tốc độ xe máy.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: orange;"></i> Ưu tiên ở nhà hoặc nơi trú ẩn.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: orange;"></i> Theo dõi cập nhật thời tiết trên điện thoại.';
      } else {
        fallback +=
          '<br><span class="emoji-anim">🟢</span> <strong>Rủi ro thấp:</strong> Thời tiết ổn định, phù hợp hoạt động bình thường.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: green;"></i> Tiếp tục theo dõi dự báo để tránh bất ngờ.<br>' +
          '<i class="fas fa-arrow-right icon-anim ai-bullet" style="color: green;"></i> Giữ liên lạc với gia đình nếu di chuyển xa.';
      }
    } else {
      fallback +=
        '<br><i class="fas fa-info-circle icon-anim" style="color: gray;"></i> Không có dữ liệu thời tiết để phân tích chi tiết. Vui lòng kiểm tra kết nối hoặc key WeatherAPI.';
    }

    document.getElementById("ai-analysis").innerHTML = fallback;
  }
}

// Khởi tạo mặc định
initMap(21.0285, 105.8542);
initFamilyMap(21.0285, 105.8542);
