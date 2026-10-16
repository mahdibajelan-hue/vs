-- already issued cards: card number := stamp (lock trigger bypassed for this one data fix)
alter table ex_welders disable trigger user;
update ex_welders set card_no = welder_raw where card_status = 'issued' and card_no is distinct from welder_raw;
alter table ex_welders enable trigger user;
