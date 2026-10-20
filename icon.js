// 아이콘: 이모지 또는 사용자가 올린 이미지(작게 줄인 data URL)
// 이미지는 기기에서 정사각형으로 잘라 96px로 줄인 뒤 문자열로 저장하므로,
// 로그인 없이도 쓸 수 있고 동기화도 그대로 됩니다.

const ICON_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const ICON_IMAGE_SIZE = 96;
const ICON_MAX_LENGTH = 60000; // DB 제약과 같게 유지
const DEFAULT_ICON = '📌';

function isImageIcon(icon) {
  return typeof icon === 'string' && icon.length <= ICON_MAX_LENGTH && ICON_IMAGE_PATTERN.test(icon);
}

function isValidIcon(icon) {
  return typeof icon === 'string' && icon.length > 0 && (icon.length <= 16 || isImageIcon(icon));
}

// 요소 안에 아이콘을 그립니다. (이미지면 <img>, 아니면 글자)
function renderIcon(target, icon) {
  target.replaceChildren();
  if (isImageIcon(icon)) {
    const img = document.createElement('img');
    img.className = 'icon-img';
    img.src = icon;
    img.alt = '';
    img.draggable = false;
    target.append(img);
  } else {
    target.textContent = isValidIcon(icon) ? icon : DEFAULT_ICON;
  }
}

// <option>처럼 글자만 쓸 수 있는 곳에서는 이미지를 🖼️로 표시합니다.
function iconLabel(icon) {
  if (isImageIcon(icon)) return '🖼️';
  return isValidIcon(icon) ? icon : DEFAULT_ICON;
}

// 아이콘 + 이름을 담은 <span>을 만듭니다.
function iconWithText(icon, text) {
  const wrap = document.createElement('span');
  wrap.className = 'icon-with-text';
  const iconEl = document.createElement('span');
  iconEl.className = 'icon-inline';
  renderIcon(iconEl, icon);
  wrap.append(iconEl, document.createTextNode(text));
  return wrap;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없어요'));
    };
    img.src = url;
  });
}

// 사진 파일 → 가운데를 정사각형으로 잘라 96px로 줄인 data URL
async function makeIconImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요');
  if (file.size > 15 * 1024 * 1024) throw new Error('15MB 이하 이미지만 올릴 수 있어요');

  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = ICON_IMAGE_SIZE;
  canvas.height = ICON_IMAGE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_IMAGE_SIZE, ICON_IMAGE_SIZE);

  // webp를 못 만드는 브라우저는 png로 돌려주므로, 크기가 넘치면 jpeg로 다시 줄입니다.
  for (const [type, quality] of [['image/webp', 0.82], ['image/jpeg', 0.8], ['image/jpeg', 0.6]]) {
    const data = canvas.toDataURL(type, quality);
    if (isImageIcon(data)) return data;
  }
  throw new Error('이미지가 너무 커요. 다른 이미지를 골라 주세요');
}
