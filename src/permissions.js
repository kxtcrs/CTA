function canConfigureSheet(interaction) {
  if (!interaction.guild || !interaction.user) return false;
  if (interaction.user.id === interaction.guild.ownerId) return true;

  const roles = interaction.member && interaction.member.roles;
  if (roles && roles.cache) {
    return roles.cache.some((role) => role.name.toLowerCase() === 'officer');
  }

  const guildRoles = interaction.guild.roles && interaction.guild.roles.cache;
  return Boolean(
    Array.isArray(roles) &&
    guildRoles &&
    roles.some((roleId) => {
      const role = guildRoles.get(roleId);
      return role && role.name.toLowerCase() === 'officer';
    })
  );
}

module.exports = { canConfigureSheet };
