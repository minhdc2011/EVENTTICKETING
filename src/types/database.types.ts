export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
      GHE: {
        Row: {
          GheID: number
          KhuVucID: number
          MaGheDayDu: string
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
      KHU_VUC: {
        Row: {
          GiaVeNiemYet: number
          KhuVucID: number
          LoaiKhuVuc: string
          MaKhuVuc: string
          MauSacHex: string
          MoTaQuyenLoi: string | null
          SuKienID: number
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
          SuKienID: number
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
          SuKienID?: number
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
        ]
      }
      LICH_TRINH: {
        Row: {
          DiaDiemHoatDong: string | null
          GioBatDau: string
          GioKetThuc: string
          LichTrinhID: number
          MoTaHoatDong: string | null
          SuKienID: number
          TenHoatDong: string
          ThuTu: number
        }
        Insert: {
          DiaDiemHoatDong?: string | null
          GioBatDau: string
          GioKetThuc: string
          LichTrinhID?: number
          MoTaHoatDong?: string | null
          SuKienID: number
          TenHoatDong: string
          ThuTu?: number
        }
        Update: {
          DiaDiemHoatDong?: string | null
          GioBatDau?: string
          GioKetThuc?: string
          LichTrinhID?: number
          MoTaHoatDong?: string | null
          SuKienID?: number
          TenHoatDong?: string
          ThuTu?: number
        }
        Relationships: [
          {
            foreignKeyName: "LICH_TRINH_SuKienID_fkey"
            columns: ["SuKienID"]
            isOneToOne: false
            referencedRelation: "SU_KIEN"
            referencedColumns: ["SuKienID"]
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
      SU_KIEN: {
        Row: {
          BannerURL: string | null
          DiaDiem: string
          MoTaChiTiet: string | null
          NgayCapNhat: string
          NgayTao: string
          PosterURL: string | null
          QuyDinhDoTuoi: string | null
          Slogan: string | null
          SoDoTongQuanURL: string | null
          SucChua: number
          SuKienID: number
          TenSanVanDong: string
          TenSuKien: string
          ThoiGianBatDau: string
          ThoiGianDongBanVe: string | null
          ThoiGianKetThuc: string
          ThoiGianMoBanVe: string
          TrailerURL: string | null
          TrangThaiMoBan: string
        }
        Insert: {
          BannerURL?: string | null
          DiaDiem: string
          MoTaChiTiet?: string | null
          NgayCapNhat?: string
          NgayTao?: string
          PosterURL?: string | null
          QuyDinhDoTuoi?: string | null
          Slogan?: string | null
          SoDoTongQuanURL?: string | null
          SucChua?: number
          SuKienID?: number
          TenSanVanDong: string
          TenSuKien: string
          ThoiGianBatDau: string
          ThoiGianDongBanVe?: string | null
          ThoiGianKetThuc: string
          ThoiGianMoBanVe: string
          TrailerURL?: string | null
          TrangThaiMoBan?: string
        }
        Update: {
          BannerURL?: string | null
          DiaDiem?: string
          MoTaChiTiet?: string | null
          NgayCapNhat?: string
          NgayTao?: string
          PosterURL?: string | null
          QuyDinhDoTuoi?: string | null
          Slogan?: string | null
          SoDoTongQuanURL?: string | null
          SucChua?: number
          SuKienID?: number
          TenSanVanDong?: string
          TenSuKien?: string
          ThoiGianBatDau?: string
          ThoiGianDongBanVe?: string | null
          ThoiGianKetThuc?: string
          ThoiGianMoBanVe?: string
          TrailerURL?: string | null
          TrangThaiMoBan?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
