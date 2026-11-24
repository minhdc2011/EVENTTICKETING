-- Bat OTP (va gioi han 4 ve) cho hai su kien mau them o migration 20261124120000 (Creative Tech Summit, Autumn Arena).
--
-- Hai su kien do khong co dong CAU_HINH_SU_KIEN nen duoc coi la KHONG yeu cau OTP: nguoi mua giu cho roi thanh toan khong qua buoc OTP,
-- lech voi cac su kien khac (da bat OTP). Chen dong cau hinh voi YeuCauXacMinhOTP = TRUE.
-- Trigger kiem soat cau hinh doi phien dang nhap cua BTC (auth.uid) nen khong chay duoc trong migration; tam tat trigger nguoi dung
-- tren CAU_HINH_SU_KIEN dung cho cau lenh nay. Idempotent: chi chen khi chua co dong cau hinh.

ALTER TABLE public."CAU_HINH_SU_KIEN" DISABLE TRIGGER USER;
INSERT INTO public."CAU_HINH_SU_KIEN" ("SuKienID", "SoVeToiDaMoiDon", "YeuCauXacMinhOTP")
SELECT e."SuKienID", 4, TRUE
FROM public."SU_KIEN" e
WHERE e."Slug" IN ('creative-tech-summit-2026', 'autumn-arena-festival-2026')
  AND NOT EXISTS (SELECT 1 FROM public."CAU_HINH_SU_KIEN" c WHERE c."SuKienID" = e."SuKienID");
ALTER TABLE public."CAU_HINH_SU_KIEN" ENABLE TRIGGER USER;

NOTIFY pgrst, 'reload schema';
