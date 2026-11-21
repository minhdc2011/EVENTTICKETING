export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Shape of the public schema, regenerated from supabase/migrations (LICH_TRINH is gone, SUAT_DIEN, TO_CHUC,
 * THANH_VIEN_TO_CHUC, HO_SO_NGUOI_DUNG, DIA_DIEM, PHIEN_BAN_SO_DO, the pricing tables QUY_TAC_GIA / DE_XUAT_GIA /
 * NHAT_KY_GIA and the later columns/RPCs are included).
 * Replace with `supabase gen types typescript` output when a project is linked.
 */
export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      CAU_HINH_SU_KIEN: {
        Row: {
          ChoPhepChonCho: boolean
          ChoPhepChuyenNhuong: boolean
          NgayCapNhat: string
          SoVeToiDaMoiDon: number
          SuKienID: number
          ThoiGianGiuChoPhut: number
          TuyChonMoRong: Json
          YeuCauCCCD: boolean
          YeuCauXacMinhOTP: boolean
        }
        Insert: {
          ChoPhepChonCho?: boolean
          ChoPhepChuyenNhuong?: boolean
          NgayCapNhat?: string
          SoVeToiDaMoiDon?: number
          SuKienID: number
          ThoiGianGiuChoPhut?: number
          TuyChonMoRong?: Json
          YeuCauCCCD?: boolean
          YeuCauXacMinhOTP?: boolean
        }
        Update: {
          ChoPhepChonCho?: boolean
          ChoPhepChuyenNhuong?: boolean
          NgayCapNhat?: string
          SoVeToiDaMoiDon?: number
          SuKienID?: number
          ThoiGianGiuChoPhut?: number
          TuyChonMoRong?: Json
          YeuCauCCCD?: boolean
          YeuCauXacMinhOTP?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "CAU_HINH_SU_KIEN_SuKienID_fkey"
            columns: ["SuKienID"]
            isOneToOne: true
            referencedRelation: "SU_KIEN"
            referencedColumns: ["SuKienID"]
          },
        ]
      }
      CHI_TIET_GIU_CHO: {
        Row: {
          DonGiaChot: number | null
          GheID: number | null
          GiuChoID: string
          ID: number
          KhuVucID: number
          MaVe: string
          SoLuong: number
        }
        Insert: {
          DonGiaChot?: number | null
          GheID?: number | null
          GiuChoID: string
          ID?: number
          KhuVucID: number
          MaVe: string
          SoLuong?: number
        }
        Update: {
          DonGiaChot?: number | null
          GheID?: number | null
          GiuChoID?: string
          ID?: number
          KhuVucID?: number
          MaVe?: string
          SoLuong?: number
        }
        Relationships: [
          {
            foreignKeyName: "CHI_TIET_GIU_CHO_GheID_fkey"
            columns: ["GheID"]
            isOneToOne: false
            referencedRelation: "GHE"
            referencedColumns: ["GheID"]
          },
          {
            foreignKeyName: "CHI_TIET_GIU_CHO_GiuChoID_fkey"
            columns: ["GiuChoID"]
            isOneToOne: false
            referencedRelation: "GIU_CHO"
            referencedColumns: ["GiuChoID"]
          },
          {
            foreignKeyName: "CHI_TIET_GIU_CHO_KhuVucID_fkey"
            columns: ["KhuVucID"]
            isOneToOne: false
            referencedRelation: "KHU_VUC"
            referencedColumns: ["KhuVucID"]
          },
        ]
      }
      DE_XUAT_GIA: {
        Row: {
          CoCanhBaoVuotKhung: boolean
          DeXuatID: number
          GhiChuDuyet: string | null
          GiaDeXuat: number
          GiaHienTai: number
          GiaTinhToanTho: number
          KhuVucID: number
          LoaiCanhBao: string
          LyDoDeXuat: string | null
          NguoiDuyetID: string | null
          QuyTacGiaID: number
          SoGioConLai: number
          ThoiGianDeXuat: string
          ThoiGianDuyet: string | null
          TocDoBanKyVong: number
          TocDoBanThucTe: number
          TrangThaiDuyet: string
          TyLeLapDay: number
        }
        Insert: {
          CoCanhBaoVuotKhung?: boolean
          DeXuatID?: number
          GhiChuDuyet?: string | null
          GiaDeXuat: number
          GiaHienTai: number
          GiaTinhToanTho: number
          KhuVucID: number
          LoaiCanhBao?: string
          LyDoDeXuat?: string | null
          NguoiDuyetID?: string | null
          QuyTacGiaID: number
          SoGioConLai: number
          ThoiGianDeXuat?: string
          ThoiGianDuyet?: string | null
          TocDoBanKyVong: number
          TocDoBanThucTe: number
          TrangThaiDuyet?: string
          TyLeLapDay: number
        }
        Update: {
          CoCanhBaoVuotKhung?: boolean
          DeXuatID?: number
          GhiChuDuyet?: string | null
          GiaDeXuat?: number
          GiaHienTai?: number
          GiaTinhToanTho?: number
          KhuVucID?: number
          LoaiCanhBao?: string
          LyDoDeXuat?: string | null
          NguoiDuyetID?: string | null
          QuyTacGiaID?: number
          SoGioConLai?: number
          ThoiGianDeXuat?: string
          ThoiGianDuyet?: string | null
          TocDoBanKyVong?: number
          TocDoBanThucTe?: number
          TrangThaiDuyet?: string
          TyLeLapDay?: number
        }
        Relationships: [
          {
            foreignKeyName: "DE_XUAT_GIA_KhuVucID_fkey"
            columns: ["KhuVucID"]
            isOneToOne: false
            referencedRelation: "KHU_VUC"
            referencedColumns: ["KhuVucID"]
          },
          {
            foreignKeyName: "DE_XUAT_GIA_NguoiDuyetID_fkey"
            columns: ["NguoiDuyetID"]
            isOneToOne: false
            referencedRelation: "HO_SO_NGUOI_DUNG"
            referencedColumns: ["NguoiDungID"]
          },
          {
            foreignKeyName: "DE_XUAT_GIA_QuyTacGiaID_fkey"
            columns: ["QuyTacGiaID"]
            isOneToOne: false
            referencedRelation: "QUY_TAC_GIA"
            referencedColumns: ["QuyTacGiaID"]
          },
        ]
      }
      DIA_DIEM: {
        Row: {
          DiaChi: string
          DiaDiemID: number
          MuiGio: string
          NgayTao: string
          SucChua: number | null
          TenDiaDiem: string
          ToChucID: string | null
        }
        Insert: {
          DiaChi: string
          DiaDiemID?: number
          MuiGio?: string
          NgayTao?: string
          SucChua?: number | null
          TenDiaDiem: string
          ToChucID?: string | null
        }
        Update: {
          DiaChi?: string
          DiaDiemID?: number
          MuiGio?: string
          NgayTao?: string
          SucChua?: number | null
          TenDiaDiem?: string
          ToChucID?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "DIA_DIEM_ToChucID_fkey"
            columns: ["ToChucID"]
            isOneToOne: false
            referencedRelation: "TO_CHUC"
            referencedColumns: ["ToChucID"]
          },
        ]
      }
      GHE: {
        Row: {
          GheID: number
          KhuVucID: number
          MaGheDayDu: string
          NgayCapNhatTrangThai: string | null
          SoGhe: string
          SoHang: string
          ToaDoX: number | null
          ToaDoY: number | null
          TrangThai: string
        }
        Insert: {
          GheID?: number
          KhuVucID: number
          MaGheDayDu: string
          NgayCapNhatTrangThai?: string | null
          SoGhe: string
          SoHang: string
          ToaDoX?: number | null
          ToaDoY?: number | null
          TrangThai?: string
        }
        Update: {
          GheID?: number
          KhuVucID?: number
          MaGheDayDu?: string
          NgayCapNhatTrangThai?: string | null
          SoGhe?: string
          SoHang?: string
          ToaDoX?: number | null
          ToaDoY?: number | null
          TrangThai?: string
        }
        Relationships: [
          {
            foreignKeyName: "GHE_KhuVucID_fkey"
            columns: ["KhuVucID"]
            isOneToOne: false
            referencedRelation: "KHU_VUC"
            referencedColumns: ["KhuVucID"]
          },
        ]
      }
      GIU_CHO: {
        Row: {
          GiuChoID: string
          HetHanLuc: string
          NgayCapNhat: string
          NgayTao: string
          NguoiDungID: string | null
          PhienNguoiDung: string
          SuKienID: number
          SuatDienID: number
          TrangThai: string
        }
        Insert: {
          GiuChoID?: string
          HetHanLuc?: string
          NgayCapNhat?: string
          NgayTao?: string
          NguoiDungID?: string | null
          PhienNguoiDung: string
          SuKienID: number
          SuatDienID: number
          TrangThai?: string
        }
        Update: {
          GiuChoID?: string
          HetHanLuc?: string
          NgayCapNhat?: string
          NgayTao?: string
          NguoiDungID?: string | null
          PhienNguoiDung?: string
          SuKienID?: number
          SuatDienID?: number
          TrangThai?: string
        }
        Relationships: [
          {
            foreignKeyName: "GIU_CHO_SuKienID_fkey"
            columns: ["SuKienID"]
            isOneToOne: false
            referencedRelation: "SU_KIEN"
            referencedColumns: ["SuKienID"]
          },
          {
            foreignKeyName: "GIU_CHO_SuatDienID_fkey"
            columns: ["SuatDienID"]
            isOneToOne: false
            referencedRelation: "SUAT_DIEN"
            referencedColumns: ["SuatDienID"]
          },
        ]
      }
      HO_SO_NGUOI_DUNG: {
        Row: {
          AnhDaiDienURL: string | null
          HoTen: string | null
          LoaiTaiKhoan: string
          NgayCapNhat: string
          NgayTao: string
          NguoiDungID: string
        }
        Insert: {
          AnhDaiDienURL?: string | null
          HoTen?: string | null
          LoaiTaiKhoan?: string
          NgayCapNhat?: string
          NgayTao?: string
          NguoiDungID: string
        }
        Update: {
          AnhDaiDienURL?: string | null
          HoTen?: string | null
          LoaiTaiKhoan?: string
          NgayCapNhat?: string
          NgayTao?: string
          NguoiDungID?: string
        }
        Relationships: []
      }
      KHU_VUC: {
        Row: {
          GiaVeNiemYet: number
          KhuVucID: number
          LoaiKhuVuc: string
          MaKhuVuc: string
          MauSacHex: string
          MoTaQuyenLoi: string | null
          SoVeToiDaMoiDon: number
          SoVeToiThieuMoiDon: number
          SuKienID: number
          SuatDienID: number
          TenKhuVuc: string
          TongSoGhe: number
        }
        Insert: {
          GiaVeNiemYet: number
          KhuVucID?: number
          LoaiKhuVuc?: string
          MaKhuVuc: string
          MauSacHex: string
          MoTaQuyenLoi?: string | null
          SoVeToiDaMoiDon?: number
          SoVeToiThieuMoiDon?: number
          SuKienID: number
          SuatDienID: number
          TenKhuVuc: string
          TongSoGhe?: number
        }
        Update: {
          GiaVeNiemYet?: number
          KhuVucID?: number
          LoaiKhuVuc?: string
          MaKhuVuc?: string
          MauSacHex?: string
          MoTaQuyenLoi?: string | null
          SoVeToiDaMoiDon?: number
          SoVeToiThieuMoiDon?: number
          SuKienID?: number
          SuatDienID?: number
          TenKhuVuc?: string
          TongSoGhe?: number
        }
        Relationships: [
          {
            foreignKeyName: "KHU_VUC_SuKienID_fkey"
            columns: ["SuKienID"]
            isOneToOne: false
            referencedRelation: "SU_KIEN"
            referencedColumns: ["SuKienID"]
          },
          {
            foreignKeyName: "KHU_VUC_SuatDienID_fkey"
            columns: ["SuatDienID"]
            isOneToOne: false
            referencedRelation: "SUAT_DIEN"
            referencedColumns: ["SuatDienID"]
          },
        ]
      }
      NGHE_SI: {
        Row: {
          HinhAnhURL: string | null
          HoTen: string
          NgayTao: string
          NgheDanh: string
          NgheSiID: number
          TieuSu: string | null
          VaiTroChinh: string | null
        }
        Insert: {
          HinhAnhURL?: string | null
          HoTen: string
          NgayTao?: string
          NgheDanh: string
          NgheSiID?: number
          TieuSu?: string | null
          VaiTroChinh?: string | null
        }
        Update: {
          HinhAnhURL?: string | null
          HoTen?: string
          NgayTao?: string
          NgheDanh?: string
          NgheSiID?: number
          TieuSu?: string | null
          VaiTroChinh?: string | null
        }
        Relationships: []
      }
      NHAT_KY_GIA: {
        Row: {
          DeXuatID: number | null
          GiaCu: number
          GiaMoi: number
          KhuVucID: number
          LoaiBienDong: string
          LyDoThayDoi: string
          NguoiThucHienID: string | null
          NhatKyGiaID: number
          ThoiGianApDung: string
          TyLeThayDoiPhanTram: number
        }
        Insert: {
          DeXuatID?: number | null
          GiaCu: number
          GiaMoi: number
          KhuVucID: number
          LoaiBienDong: string
          LyDoThayDoi: string
          NguoiThucHienID?: string | null
          NhatKyGiaID?: number
          ThoiGianApDung?: string
          TyLeThayDoiPhanTram: number
        }
        Update: {
          DeXuatID?: number | null
          GiaCu?: number
          GiaMoi?: number
          KhuVucID?: number
          LoaiBienDong?: string
          LyDoThayDoi?: string
          NguoiThucHienID?: string | null
          NhatKyGiaID?: number
          ThoiGianApDung?: string
          TyLeThayDoiPhanTram?: number
        }
        Relationships: [
          {
            foreignKeyName: "NHAT_KY_GIA_DeXuatID_fkey"
            columns: ["DeXuatID"]
            isOneToOne: true
            referencedRelation: "DE_XUAT_GIA"
            referencedColumns: ["DeXuatID"]
          },
          {
            foreignKeyName: "NHAT_KY_GIA_KhuVucID_fkey"
            columns: ["KhuVucID"]
            isOneToOne: false
            referencedRelation: "KHU_VUC"
            referencedColumns: ["KhuVucID"]
          },
          {
            foreignKeyName: "NHAT_KY_GIA_NguoiThucHienID_fkey"
            columns: ["NguoiThucHienID"]
            isOneToOne: false
            referencedRelation: "HO_SO_NGUOI_DUNG"
            referencedColumns: ["NguoiDungID"]
          },
        ]
      }
      PHIEN_BAN_SO_DO: {
        Row: {
          DaKhoa: boolean
          DiaDiemID: number
          DuLieuSoDo: Json
          NgayTao: string
          PhienBanSoDoID: string
          SoPhienBan: number
          TenPhienBan: string
        }
        Insert: {
          DaKhoa?: boolean
          DiaDiemID: number
          DuLieuSoDo?: Json
          NgayTao?: string
          PhienBanSoDoID?: string
          SoPhienBan: number
          TenPhienBan: string
        }
        Update: {
          DaKhoa?: boolean
          DiaDiemID?: number
          DuLieuSoDo?: Json
          NgayTao?: string
          PhienBanSoDoID?: string
          SoPhienBan?: number
          TenPhienBan?: string
        }
        Relationships: [
          {
            foreignKeyName: "PHIEN_BAN_SO_DO_DiaDiemID_fkey"
            columns: ["DiaDiemID"]
            isOneToOne: false
            referencedRelation: "DIA_DIEM"
            referencedColumns: ["DiaDiemID"]
          },
        ]
      }
      QUY_TAC_GIA: {
        Row: {
          BienDoToiDaMoiChuKy: number
          BuocNhayGia: number
          GiaGoc: number
          GiaSan: number
          GiaTran: number
          KhuVucID: number
          NgayCapNhat: string
          NgayTao: string
          NguoiCapNhatID: string | null
          NguongLapDayCao: number
          NguongLapDayThap: number
          QuyTacGiaID: number
          TrangThaiKichHoat: boolean
          TrongSoLapDay: number
          TrongSoThoiGian: number
          TrongSoTocDoBan: number
        }
        Insert: {
          BienDoToiDaMoiChuKy?: number
          BuocNhayGia?: number
          GiaGoc: number
          GiaSan: number
          GiaTran: number
          KhuVucID: number
          NgayCapNhat?: string
          NgayTao?: string
          NguoiCapNhatID?: string | null
          NguongLapDayCao?: number
          NguongLapDayThap?: number
          QuyTacGiaID?: number
          TrangThaiKichHoat?: boolean
          TrongSoLapDay?: number
          TrongSoThoiGian?: number
          TrongSoTocDoBan?: number
        }
        Update: {
          BienDoToiDaMoiChuKy?: number
          BuocNhayGia?: number
          GiaGoc?: number
          GiaSan?: number
          GiaTran?: number
          KhuVucID?: number
          NgayCapNhat?: string
          NgayTao?: string
          NguoiCapNhatID?: string | null
          NguongLapDayCao?: number
          NguongLapDayThap?: number
          QuyTacGiaID?: number
          TrangThaiKichHoat?: boolean
          TrongSoLapDay?: number
          TrongSoThoiGian?: number
          TrongSoTocDoBan?: number
        }
        Relationships: [
          {
            foreignKeyName: "QUY_TAC_GIA_KhuVucID_fkey"
            columns: ["KhuVucID"]
            isOneToOne: true
            referencedRelation: "KHU_VUC"
            referencedColumns: ["KhuVucID"]
          },
          {
            foreignKeyName: "QUY_TAC_GIA_NguoiCapNhatID_fkey"
            columns: ["NguoiCapNhatID"]
            isOneToOne: false
            referencedRelation: "HO_SO_NGUOI_DUNG"
            referencedColumns: ["NguoiDungID"]
          },
        ]
      }
      SUAT_DIEN: {
        Row: {
          DiaDiemID: number | null
          MuiGio: string
          NgayCapNhat: string
          NgayTao: string
          PhienBanSoDoID: string | null
          Slug: string
          SuKienID: number
          SuatDienID: number
          TenSuatDien: string
          ThoiGianBatDau: string
          ThoiGianDongBanVe: string | null
          ThoiGianKetThuc: string
          ThoiGianMoBanVe: string
          ThoiGianMoCua: string | null
          TrangThai: string
        }
        Insert: {
          DiaDiemID?: number | null
          MuiGio?: string
          NgayCapNhat?: string
          NgayTao?: string
          PhienBanSoDoID?: string | null
          Slug: string
          SuKienID: number
          SuatDienID?: number
          TenSuatDien: string
          ThoiGianBatDau: string
          ThoiGianDongBanVe?: string | null
          ThoiGianKetThuc: string
          ThoiGianMoBanVe: string
          ThoiGianMoCua?: string | null
          TrangThai?: string
        }
        Update: {
          DiaDiemID?: number | null
          MuiGio?: string
          NgayCapNhat?: string
          NgayTao?: string
          PhienBanSoDoID?: string | null
          Slug?: string
          SuKienID?: number
          SuatDienID?: number
          TenSuatDien?: string
          ThoiGianBatDau?: string
          ThoiGianDongBanVe?: string | null
          ThoiGianKetThuc?: string
          ThoiGianMoBanVe?: string
          ThoiGianMoCua?: string | null
          TrangThai?: string
        }
        Relationships: [
          {
            foreignKeyName: "SUAT_DIEN_DiaDiemID_fkey"
            columns: ["DiaDiemID"]
            isOneToOne: false
            referencedRelation: "DIA_DIEM"
            referencedColumns: ["DiaDiemID"]
          },
          {
            foreignKeyName: "SUAT_DIEN_PhienBanSoDoID_fkey"
            columns: ["PhienBanSoDoID"]
            isOneToOne: false
            referencedRelation: "PHIEN_BAN_SO_DO"
            referencedColumns: ["PhienBanSoDoID"]
          },
          {
            foreignKeyName: "SUAT_DIEN_SuKienID_fkey"
            columns: ["SuKienID"]
            isOneToOne: false
            referencedRelation: "SU_KIEN"
            referencedColumns: ["SuKienID"]
          },
        ]
      }
      SU_KIEN: {
        Row: {
          BannerURL: string | null
          ChinhSachHoanHuy: string | null
          DiaDiem: string
          DuongDanTrucTuyen: string | null
          EmailLienHe: string | null
          FanpageURL: string | null
          HotlineLienHe: string | null
          HuongDanThamGiaTrucTuyen: string | null
          LoaiHinhSuKien: string
          MoTaChiTiet: string | null
          NgayCapNhat: string
          NgayTao: string
          PosterURL: string | null
          QuyDinhDoTuoi: string | null
          QuyDinhThamGia: string | null
          Slogan: string | null
          Slug: string
          SoDoTongQuanURL: string | null
          SoGiayPhepBieuDien: string | null
          SuKienID: number
          SucChua: number
          TemplateKey: string
          TenSanVanDong: string
          TenSuKien: string
          TheLoai: string
          ThoiGianBatDau: string
          ThoiGianDongBanVe: string | null
          ThoiGianKetThuc: string
          ThoiGianMoBanVe: string
          ToChucID: string
          TrailerURL: string | null
          TrangThaiCongBo: string
          TrangThaiMoBan: string
        }
        Insert: {
          BannerURL?: string | null
          ChinhSachHoanHuy?: string | null
          DiaDiem: string
          DuongDanTrucTuyen?: string | null
          EmailLienHe?: string | null
          FanpageURL?: string | null
          HotlineLienHe?: string | null
          HuongDanThamGiaTrucTuyen?: string | null
          LoaiHinhSuKien?: string
          MoTaChiTiet?: string | null
          NgayCapNhat?: string
          NgayTao?: string
          PosterURL?: string | null
          QuyDinhDoTuoi?: string | null
          QuyDinhThamGia?: string | null
          Slogan?: string | null
          Slug: string
          SoDoTongQuanURL?: string | null
          SoGiayPhepBieuDien?: string | null
          SuKienID?: number
          SucChua?: number
          TemplateKey?: string
          TenSanVanDong: string
          TenSuKien: string
          TheLoai?: string
          ThoiGianBatDau: string
          ThoiGianDongBanVe?: string | null
          ThoiGianKetThuc: string
          ThoiGianMoBanVe: string
          ToChucID: string
          TrailerURL?: string | null
          TrangThaiCongBo?: string
          TrangThaiMoBan?: string
        }
        Update: {
          BannerURL?: string | null
          ChinhSachHoanHuy?: string | null
          DiaDiem?: string
          DuongDanTrucTuyen?: string | null
          EmailLienHe?: string | null
          FanpageURL?: string | null
          HotlineLienHe?: string | null
          HuongDanThamGiaTrucTuyen?: string | null
          LoaiHinhSuKien?: string
          MoTaChiTiet?: string | null
          NgayCapNhat?: string
          NgayTao?: string
          PosterURL?: string | null
          QuyDinhDoTuoi?: string | null
          QuyDinhThamGia?: string | null
          Slogan?: string | null
          Slug?: string
          SoDoTongQuanURL?: string | null
          SoGiayPhepBieuDien?: string | null
          SuKienID?: number
          SucChua?: number
          TemplateKey?: string
          TenSanVanDong?: string
          TenSuKien?: string
          TheLoai?: string
          ThoiGianBatDau?: string
          ThoiGianDongBanVe?: string | null
          ThoiGianKetThuc?: string
          ThoiGianMoBanVe?: string
          ToChucID?: string
          TrailerURL?: string | null
          TrangThaiCongBo?: string
          TrangThaiMoBan?: string
        }
        Relationships: [
          {
            foreignKeyName: "SU_KIEN_ToChucID_fkey"
            columns: ["ToChucID"]
            isOneToOne: false
            referencedRelation: "TO_CHUC"
            referencedColumns: ["ToChucID"]
          },
        ]
      }
      SU_KIEN_NGHE_SI: {
        Row: {
          ID: number
          NgheSiID: number
          SuKienID: number
          ThuTuHienThi: number
          VaiTroTrongSuKien: string
        }
        Insert: {
          ID?: number
          NgheSiID: number
          SuKienID: number
          ThuTuHienThi?: number
          VaiTroTrongSuKien?: string
        }
        Update: {
          ID?: number
          NgheSiID?: number
          SuKienID?: number
          ThuTuHienThi?: number
          VaiTroTrongSuKien?: string
        }
        Relationships: [
          {
            foreignKeyName: "SU_KIEN_NGHE_SI_NgheSiID_fkey"
            columns: ["NgheSiID"]
            isOneToOne: false
            referencedRelation: "NGHE_SI"
            referencedColumns: ["NgheSiID"]
          },
          {
            foreignKeyName: "SU_KIEN_NGHE_SI_SuKienID_fkey"
            columns: ["SuKienID"]
            isOneToOne: false
            referencedRelation: "SU_KIEN"
            referencedColumns: ["SuKienID"]
          },
        ]
      }
      THANH_VIEN_TO_CHUC: {
        Row: {
          ID: string
          NgayTao: string
          NguoiDungID: string
          ToChucID: string
          VaiTro: string
        }
        Insert: {
          ID?: string
          NgayTao?: string
          NguoiDungID: string
          ToChucID: string
          VaiTro: string
        }
        Update: {
          ID?: string
          NgayTao?: string
          NguoiDungID?: string
          ToChucID?: string
          VaiTro?: string
        }
        Relationships: [
          {
            foreignKeyName: "THANH_VIEN_TO_CHUC_ToChucID_fkey"
            columns: ["ToChucID"]
            isOneToOne: false
            referencedRelation: "TO_CHUC"
            referencedColumns: ["ToChucID"]
          },
        ]
      }
      TO_CHUC: {
        Row: {
          NgayCapNhat: string
          NgayTao: string
          Slug: string
          TenToChuc: string
          ToChucID: string
          TrangThai: string
        }
        Insert: {
          NgayCapNhat?: string
          NgayTao?: string
          Slug: string
          TenToChuc: string
          ToChucID?: string
          TrangThai?: string
        }
        Update: {
          NgayCapNhat?: string
          NgayTao?: string
          Slug?: string
          TenToChuc?: string
          ToChucID?: string
          TrangThai?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      co_quyen_bien_tap_to_chuc: {
        Args: { p_to_chuc_id: string }
        Returns: boolean
      }
      co_quyen_dinh_gia: {
        Args: { p_su_kien_id: number }
        Returns: boolean
      }
      cong_bo_su_kien: {
        Args: { p_su_kien_id: number }
        Returns: boolean
      }
      duyet_de_xuat_gia: {
        Args: { p_de_xuat_id: number; p_ghi_chu: string; p_gia_dieu_chinh?: number }
        Returns: Json
      }
      expire_seat_holds: {
        Args: { p_su_kien_id?: number }
        Returns: number
      }
      gan_loai_tai_khoan: {
        Args: { p_email: string; p_loai: string }
        Returns: Json
      }
      het_han_de_xuat_gia: {
        Args: { p_su_kien_id: number }
        Returns: Json
      }
      huy_giu_cho: {
        Args: { p_giu_cho_id: string; p_phien_id: string }
        Returns: boolean
      }
      la_ban_to_chuc: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      la_thanh_vien_to_chuc: {
        Args: { p_to_chuc_id: string }
        Returns: boolean
      }
      lay_loai_tai_khoan: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      lay_so_lieu_dinh_gia: {
        Args: { p_su_kien_id: number }
        Returns: Array<{
          khu_vuc_id: number | null
          suat_dien_id: number | null
          su_kien_id: number | null
          ma_khu_vuc: string | null
          ten_khu_vuc: string | null
          trang_thai_suat: string | null
          thoi_gian_mo_ban: string | null
          thoi_gian_dong_ban: string | null
          thoi_gian_bat_dau: string | null
          dang_mo_ban: boolean | null
          gia_hien_hanh: number | null
          quy_tac_gia_id: number | null
          co_quy_tac: boolean | null
          kich_hoat: boolean | null
          gia_goc: number | null
          gia_san: number | null
          gia_tran: number | null
          buoc_nhay: number | null
          bien_do: number | null
          nguong_thap: number | null
          nguong_cao: number | null
          trong_so_lap_day: number | null
          trong_so_toc_do: number | null
          trong_so_thoi_gian: number | null
          n_total: number | null
          n_sold: number | null
          n_hold: number | null
          so_ban_6h: number | null
          v_actual: number | null
          t_rem_gio: number | null
          tong_gio_mo_ban: number | null
          v_target: number | null
          de_xuat_pending_id: number | null
          co_pending: boolean | null
          mo_phong: boolean | null
          thoi_diem_tinh: string | null
        }>
      }
      luu_de_xuat_gia: {
        Args: { p_khu_vuc_id: number; p_quy_tac_gia_id: number; p_quy_tac_ngay_cap_nhat: string; p_gia_de_xuat: number; p_gia_tinh_toan_tho: number; p_ly_do: string }
        Returns: Json
      }
      luu_quy_tac_gia: {
        Args: { p_khu_vuc_id: number; p_gia_goc: number; p_gia_san: number; p_gia_tran: number; p_buoc_nhay_gia: number; p_bien_do_toi_da: number; p_nguong_lap_day_thap: number; p_nguong_lap_day_cao: number; p_trong_so_lap_day: number; p_trong_so_toc_do_ban: number; p_trong_so_thoi_gian: number; p_trang_thai_kich_hoat: boolean }
        Returns: Json
      }
      luu_su_kien_toan_dien: {
        Args: { p_payload: Json }
        Returns: Json
      }
      mo_phong_nhu_cau: {
        Args: { p_su_kien_id: number; p_kich_ban: string }
        Returns: Json
      }
      suat_dien_dang_mo_ban: {
        Args: { p_su_kien_id: number; p_suat_dien_id: number }
        Returns: boolean
      }
      tao_ban_nhap_su_kien: {
        Args: { p_bat_dau: string; p_dia_chi: string; p_dong_ban: string; p_gia_ve: number; p_ket_thuc: string; p_mo_ban: string; p_mo_ta: string; p_slug: string; p_suc_chua: number; p_ten_dia_diem: string; p_ten_su_kien: string; p_the_loai: string; p_to_chuc_id: string }
        Returns: Json
      }
      tao_giu_cho: {
        Args: { p_items: Json; p_phien_id: string; p_su_kien_id: number }
        Returns: Json
      }
      tao_giu_cho_theo_suat: {
        Args: { p_items: Json; p_phien_id: string; p_suat_dien_id: number }
        Returns: Json
      }
      tao_to_chuc_cua_toi: {
        Args: { p_slug: string; p_ten_to_chuc: string }
        Returns: Json
      }
      tu_choi_de_xuat_gia: {
        Args: { p_de_xuat_id: number; p_ly_do: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
