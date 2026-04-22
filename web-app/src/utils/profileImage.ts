const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const OUTPUT_IMAGE_SIZE = 256;
const OUTPUT_IMAGE_QUALITY = 0.85;

export const getUserInitials = (name: string) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read the selected image.'));
  reader.readAsDataURL(file);
});

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Failed to process the selected image.'));
  image.src = src;
});

export const convertProfileImageFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file.');
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    throw new Error('Please choose an image smaller than 5 MB.');
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_IMAGE_SIZE;
  canvas.height = OUTPUT_IMAGE_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image processing is not available in this browser.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const output = canvas.toDataURL('image/jpeg', OUTPUT_IMAGE_QUALITY);
  if (!output) {
    throw new Error('Failed to prepare the selected image.');
  }

  return output;
};
