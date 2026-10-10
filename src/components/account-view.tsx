"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useQuery } from "@/hooks/use-query";
import { addressSchema, fieldErrors, formValues, profileSchema } from "@/lib/validation";
import { signOut } from "@/services/auth-service";
import { addAddress, deleteAddress, getProfile, listAddresses, setDefaultAddress, updateProfile } from "@/services/account-service";
import { ErrorState } from "@/components/ui/states";
import { Field, FormMessage, primaryButton, secondaryButton } from "@/components/ui/form";
import type { Address, Profile } from "@/types";

export function AccountView() {
  return <AuthGate>{(userId, email) => <AccountContent userId={userId} email={email} />}</AuthGate>;
}

function AccountContent({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const profile = useQuery(`profile:${userId}`, () => getProfile(userId));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tài khoản</h1>
          <p className="text-sm text-neutral-600">{email}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className={secondaryButton}
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Thông tin cá nhân</h2>
        {profile.status === "loading" && <div className="h-32 animate-pulse rounded-lg bg-neutral-200" />}
        {profile.status === "error" && <ErrorState />}
        {profile.status === "success" && <ProfileForm userId={userId} profile={profile.data} />}
      </section>

    </div>
  );
}

function ProfileForm({ userId, profile }: { userId: string; profile: Profile }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = profileSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setStatus("saving");
    try {
      await updateProfile(userId, parsed.data);
      setStatus("saved");
    } catch (err) {
      console.error(err);
      setStatus("failed");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4">
      {status === "saved" && <FormMessage kind="success">Đã lưu thông tin.</FormMessage>}
      {status === "failed" && <FormMessage kind="error">Không lưu được, vui lòng thử lại.</FormMessage>}
      <Field label="Họ và tên" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={100} autoComplete="name" error={errors.full_name} />
      <Field label="Số điện thoại" name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" error={errors.phone} />
      <button type="submit" disabled={status === "saving"} className={primaryButton}>
        {status === "saving" ? "Đang lưu..." : "Lưu thay đổi"}
      </button>
    </form>
  );
}

function AddressBook({ userId }: { userId: string }) {
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = useQuery(`addresses:${userId}:${version}`, listAddresses);
  const refresh = () => setVersion((v) => v + 1);

  async function run(action: () => Promise<void>) {
    setFailed(false);
    try {
      await action();
      refresh();
    } catch (err) {
      console.error(err);
      setFailed(true);
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Địa chỉ giao hàng</h2>
        {!adding && <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>Thêm địa chỉ</button>}
      </div>
      {failed && <div className="mb-4"><FormMessage kind="error">Thao tác không thành công, vui lòng thử lại.</FormMessage></div>}

      {adding && (
        <AddressForm
          onCancel={() => setAdding(false)}
          onSubmit={(values, makeDefault) =>
            run(async () => {
              await addAddress(userId, values, makeDefault);
              setAdding(false);
            })
          }
          isFirst={list.status === "success" && list.data.length === 0}
        />
      )}

      {list.status === "loading" && <div className="h-24 animate-pulse rounded-lg bg-neutral-200" />}
      {list.status === "error" && <ErrorState />}
      {list.status === "success" && list.data.length === 0 && !adding && (
        <p className="text-sm text-neutral-600">Bạn chưa lưu địa chỉ nào.</p>
      )}
      {list.status === "success" && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {list.data.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onDefault={() => run(() => setDefaultAddress(userId, a.id))}
              onDelete={() => run(() => deleteAddress(a.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AddressCard({ address: a, onDefault, onDelete }: { address: Address; onDefault: () => void; onDelete: () => void }) {
  return (
    <li className="rounded-lg border border-neutral-200 p-4 text-sm">
      <p className="font-medium">
        {a.recipient_name} · {a.phone}
        {a.is_default && <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-normal text-white">Mặc định</span>}
      </p>
      <p className="mt-1 text-neutral-600">{[a.street, a.ward, a.district, a.province].join(", ")}</p>
      <div className="mt-3 flex gap-4">
        {!a.is_default && <button type="button" onClick={onDefault} className="underline hover:text-neutral-600">Đặt làm mặc định</button>}
        <button type="button" onClick={onDelete} className="text-red-600 hover:underline">Xóa</button>
      </div>
    </li>
  );
}

function AddressForm({
  onSubmit,
  onCancel,
  isFirst,
}: {
  onSubmit: (values: Omit<Address, "id" | "is_default">, makeDefault: boolean) => void;
  onCancel: () => void;
  isFirst: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formValues(e.currentTarget);
    const parsed = addressSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    onSubmit(parsed.data, isFirst || values.is_default === "on");
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-2xl gap-4 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2">
      <Field label="Tên người nhận" name="recipient_name" maxLength={100} error={errors.recipient_name} />
      <Field label="Số điện thoại" name="phone" type="tel" error={errors.phone} />
      <Field label="Tỉnh / Thành phố" name="province" maxLength={100} error={errors.province} />
      <Field label="Quận / Huyện" name="district" maxLength={100} error={errors.district} />
      <Field label="Phường / Xã" name="ward" maxLength={100} error={errors.ward} />
      <Field label="Địa chỉ cụ thể (số nhà, đường)" name="street" maxLength={200} error={errors.street} />
      {!isFirst && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="is_default" /> Đặt làm địa chỉ mặc định
        </label>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" className={primaryButton}>Lưu địa chỉ</button>
        <button type="button" onClick={onCancel} className={secondaryButton}>Hủy</button>
      </div>
    </form>
  );
}
