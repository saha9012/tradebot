/** Steam: success === 1 и есть buy_orderid. Библиотека steam-market делает Boolean(2) === true — ловушка. */
function isBuyOrderAccepted(result) {
  if (result?.dryRun) return true;
  const code = result?._data?.success;
  const id = result?.buyOrderId ?? result?._data?.buy_orderid;
  if (code === 1 && id) return true;
  if (id && Number(id) > 0) return true;
  return false;
}

function buyOrderFailureMessage(result) {
  const msg =
    result?._data?.message ||
    result?.message ||
    null;
  const code = result?._data?.success;

  if (msg) return msg;
  if (code === 15) return 'Аккаунт не может пользоваться Community Market (трейд-бан / ограничение)';
  if (code === 2) return 'Цена ордера ниже минимума Steam для этого предмета';
  if (code != null && code !== 1) return `Steam отклонил ордер (success=${code})`;
  return 'Ордер не создан';
}

function buyOrderFailureHint(result) {
  const code = result?._data?.success;
  const msg = String(result?._data?.message || '').toLowerCase();

  if (code === 15 || msg.includes('unable to use the community market')) {
    return 'Ограничение аккаунта: маркет недоступен (трейд-бан или аналог). Ждать снятия.';
  }
  if (code === 2 || msg.includes('minimum')) {
    return 'Цена слишком низкая — подними до минимума Steam для предмета.';
  }
  return 'Смотри steamMessage и steamSuccessCode.';
}

module.exports = { isBuyOrderAccepted, buyOrderFailureMessage, buyOrderFailureHint };
