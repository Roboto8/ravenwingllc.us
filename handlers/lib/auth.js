// Extract user info from API Gateway JWT authorizer claims
module.exports = {
  getUser(event) {
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return null;
    return {
      sub: claims.sub,
      email: claims.email
    };
  },

  async getCompanyId(event, db) {
    const user = this.getUser(event);
    if (!user) return null;

    const items = await db.queryGSI('USER#' + user.sub);
    if (items.length === 0) return null;

    // GSI1SK is COMPANY#<id>
    return items[0].GSI1SK.replace('COMPANY#', '');
  }
};
