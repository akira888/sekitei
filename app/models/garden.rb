# 1つの石庭。URL の uuid を知っていれば編集できるので、推測されにくい完全ランダムの v4 を振る。
# 砂紋などの中身は scene（JSON）に丸ごと持ち、読むのはクライアント。
# サーバーはクライアントが読めなくなる形だけを弾き、図形ごとの値までは見ない（TS の型と二重に持たないため）
class Garden < ApplicationRecord
  attribute :uuid, default: -> { SecureRandom.uuid }
  attribute :scene, default: -> { { "version" => 1, "shapes" => [] } }

  validate :scene_must_be_readable

  # URL には連番の id ではなく uuid を出す
  def to_param
    uuid
  end

  private

  def scene_must_be_readable
    readable = scene.is_a?(Hash) &&
      scene["version"].is_a?(Integer) && scene["version"].positive? &&
      objects?(scene["shapes"]) &&
      (!scene.key?("stones") || objects?(scene["stones"])) # 石を足す前の庭には stones がない
    errors.add(:scene, :invalid) unless readable
  end

  def objects?(value)
    value.is_a?(Array) && value.all?(Hash)
  end
end
