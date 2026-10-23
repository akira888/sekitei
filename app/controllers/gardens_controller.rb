# 庭を作り、uuid の URL で編集する。保存はエディタが操作のたびに scene を JSON で PATCH する
class GardensController < ApplicationController
  before_action :set_garden, only: %i[show update]
  # 共有が始まるので、1つの IP からの作成・保存の回数を制限する
  rate_limit to: 10, within: 3.minutes, only: :create, store: Rails.application.config.x.rate_limit_store
  rate_limit to: 120, within: 1.minute, only: :update, store: Rails.application.config.x.rate_limit_store

  def create
    garden = Garden.create!
    redirect_to garden, status: :see_other
  end

  # ページに埋め込む scene は表示したときのもの。ブラウザが「戻る」で HTTP キャッシュの古いページを出すと
  # 編集する前の庭に戻り、次の保存で新しい内容を上書きしてしまうので、キャッシュさせない
  def show
    no_store
  end

  # 完成した庭は編集できない
  def update
    return head :forbidden if @garden.completed?

    if @garden.update(scene: params.expect(scene: {}).to_h)
      head :no_content
    else
      render json: { errors: @garden.errors.full_messages }, status: :unprocessable_content
    end
  end

  private

  def set_garden
    @garden = Garden.find_by!(uuid: params[:uuid])
  end
end
