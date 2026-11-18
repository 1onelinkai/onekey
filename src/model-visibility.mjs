export function filterModels(models, query = '', category = '全部') {
  const search = query.trim().toLowerCase();
  return models.filter(model => {
    if (search) return model.id.toLowerCase().includes(search) ||
      (model.showInSquare !== false && (model.name || '').toLowerCase().includes(search));
    return model.showInSquare !== false && (category === '全部' || (model.category || '其他') === category);
  });
}
