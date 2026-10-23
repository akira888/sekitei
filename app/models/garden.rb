# 1つの石庭。URL の uuid を知っていれば編集できるので、推測されにくい完全ランダムの v4 を振る。
# 砂紋などの中身は scene（JSON）に丸ごと持ち、読むのはクライアント。
# サーバーはクライアントが読めなくなる形だけを弾き、図形ごとの値までは見ない（TS の型と二重に持たないため）
class Garden < ApplicationRecord
  attribute :uuid, default: -> { SecureRandom.uuid }
  # 新しい庭は空の砂から、砂利の縁ありで始める
  attribute :scene, default: -> { { "version" => 1, "shapes" => [], "gravel" => { "edge" => true } } }

  # 共有された庭を開いた人の画面が重くならないよう、また保存の送信の上限（keepalive の 64KiB）に合わせる
  MAX_SCENE_BYTES = 64.kilobytes

  validate :scene_must_be_readable
  validate :scene_must_be_small
  validate :scene_must_not_change_after_completion
  # 名前は完成するときに付ける。完成前の庭には名前がない
  validates :name, presence: true, length: { maximum: 100 }, on: :complete

  # URL には連番の id ではなく uuid を出す
  def to_param
    uuid
  end

  def completed?
    completed_at.present?
  end

  # 名前を付けて完成させる。完成した庭は以後編集できない。完成済みや名前が不正なら false
  def complete(name)
    if completed?
      errors.add(:base, :already_completed, message: "すでに完成しています")
      return false
    end

    self.name = name.to_s.strip
    self.completed_at = Time.current
    return true if save(context: :complete)

    restore_attributes(%i[name completed_at])
    false
  end

  private

  def scene_must_be_readable
    readable = scene.is_a?(Hash) &&
      scene["version"].is_a?(Integer) && scene["version"].positive? &&
      objects?(scene["shapes"]) &&
      (!scene.key?("stones") || objects?(scene["stones"])) && # 石を足す前の庭には stones がない
      (!scene.key?("gravel") || scene["gravel"].is_a?(Hash)) # 砂利を足す前の庭には gravel がない
    errors.add(:scene, :invalid) unless readable
  end

  def scene_must_be_small
    errors.add(:scene, :too_large, message: "が大きすぎます") if scene.to_json.bytesize > MAX_SCENE_BYTES
  end

  def scene_must_not_change_after_completion
    errors.add(:scene, :completed, message: "は完成した庭では変えられません") if completed_at_was.present? && will_save_change_to_scene?
  end

  def objects?(value)
    value.is_a?(Array) && value.all?(Hash)
  end
end
