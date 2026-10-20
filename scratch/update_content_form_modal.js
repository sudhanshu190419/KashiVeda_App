const fs = require('fs');

const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/modals/content-form-modal.tsx';
let modalCode = fs.readFileSync(modalPath, 'utf8');

// 1. Add import of astrology-datetime-utils
if (!modalCode.includes('astrology-datetime-utils')) {
  modalCode = modalCode.replace(
    'import { saveAstrologyContent } from "@/lib/actions/astrology-management";',
    'import { saveAstrologyContent } from "@/lib/actions/astrology-management";\nimport {\n  formatInstantToLocalDatetimeInput,\n  getLocalCurrentDatetimeInput,\n  parseLocalDatetimeInputToInstant,\n} from "@/lib/astrology/astrology-datetime-utils";'
  );
  console.log('Added astrology-datetime-utils import');
}

// 2. Replace useEffect initialization
const oldEffect = `  useEffect(() => {
    if (contentItem) {
      setChannel(contentItem.channel);
      setTitle(contentItem.title || "");
      setBody(contentItem.body);
      setPublishAt(contentItem.publishAt ? contentItem.publishAt.slice(0, 16) : "");
      setExpiresAt(contentItem.expiresAt ? contentItem.expiresAt.slice(0, 16) : "");
      setStatus(contentItem.status);
    } else {
      setChannel("in_app");
      setTitle("");
      setBody("");
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setPublishAt(now.toISOString().slice(0, 16));
      setExpiresAt("");
      setStatus("draft");
    }
    setError(null);
  }, [contentItem, isOpen]);`;

const newEffect = `  useEffect(() => {
    if (contentItem) {
      setChannel(contentItem.channel);
      setTitle(contentItem.title || "");
      setBody(contentItem.body);
      // AST-14: Timezone-aware formatting preserves stored instant representation
      setPublishAt(formatInstantToLocalDatetimeInput(contentItem.publishAt));
      setExpiresAt(formatInstantToLocalDatetimeInput(contentItem.expiresAt));
      setStatus(contentItem.status);
    } else {
      setChannel("in_app");
      setTitle("");
      setBody("");
      // AST-14: Default new entry to current local wall-clock time
      setPublishAt(getLocalCurrentDatetimeInput());
      setExpiresAt("");
      setStatus("draft");
    }
    setError(null);
  }, [contentItem, isOpen]);`;

if (modalCode.includes(oldEffect)) {
  modalCode = modalCode.replace(oldEffect, newEffect);
  console.log('Replaced useEffect block');
} else {
  console.log('Old useEffect block not found, checking existing content...');
}

// 3. Replace handleSubmit
const oldSubmitStart = '  const handleSubmit = async (e: React.FormEvent) => {';
const oldSubmitEnd = '    const res = await saveAstrologyContent(formData);';
const submitStartIdx = modalCode.indexOf(oldSubmitStart);
const submitEndIdx = modalCode.indexOf(oldSubmitEnd);

if (submitStartIdx !== -1 && submitEndIdx !== -1) {
  const oldSubmitSection = modalCode.substring(submitStartIdx, submitEndIdx);
  const newSubmitSection = `  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 5) {
      setError("Content body must be at least 5 characters.");
      return;
    }
    if (!publishAt) {
      setError("Publish date and time is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let parsedPublishAt: string | null = null;
    let parsedExpiresAt: string | null = null;

    try {
      // AST-14: Preserve unchanged instants exactly; parse deliberate edits safely
      parsedPublishAt = parseLocalDatetimeInputToInstant(publishAt, contentItem?.publishAt);
      parsedExpiresAt = parseLocalDatetimeInputToInstant(expiresAt, contentItem?.expiresAt);
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || "Invalid publish or expiry date/time.");
      return;
    }

    if (!parsedPublishAt) {
      setIsSubmitting(false);
      setError("Publish date and time is required.");
      return;
    }

    if (parsedExpiresAt && new Date(parsedExpiresAt) <= new Date(parsedPublishAt)) {
      setIsSubmitting(false);
      setError("Expiry date and time must be after the publication date and time.");
      return;
    }

    const formData: AstrologyContentFormData = {
      id: contentItem?.id,
      channel,
      title: title.trim() || undefined,
      body: body.trim(),
      publish_at: parsedPublishAt,
      expires_at: parsedExpiresAt,
      status,
    };

`;
  modalCode = modalCode.replace(oldSubmitSection, newSubmitSection);
  console.log('Replaced handleSubmit block');
}

fs.writeFileSync(modalPath, modalCode, 'utf8');
console.log('Updated content-form-modal.tsx successfully');
