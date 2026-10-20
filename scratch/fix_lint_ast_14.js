const fs = require('fs');

const p = 'C:/Projects/kashi-veda-admin/components/admin/astrology/modals/content-form-modal.tsx';
let c = fs.readFileSync(p, 'utf8');

const oldCatch = `    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || "Invalid publish or expiry date/time.");
      return;
    }`;

const newCatch = `    } catch (err: unknown) {
      setIsSubmitting(false);
      const errMsg = err instanceof Error ? err.message : "Invalid publish or expiry date/time.";
      setError(errMsg);
      return;
    }`;

c = c.replace(oldCatch, newCatch);
fs.writeFileSync(p, c, 'utf8');
console.log('Fixed any in content-form-modal.tsx');
